import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";
import { resolveTenantFromPublishableKeyHeader } from "../api/store/tenant/resolve-tenant";
import { classifyOp } from "./allow-list";
import { pricesOf, productIdOf, variantIdOf, type ChangesetOp } from "./ops";
import { stageOf } from "./stage";

/**
 * The stage storefront's preview of a product change (t-2026-10-27-04,
 * decision recorded with `decide.mjs`).
 *
 * The sites of a group share their products, so a staged product op is not
 * written anywhere until it is published. Instead, a Store answer read with
 * the STAGE site's publishable key gets the staged ops laid over it: title,
 * subtitle, description, thumbnail, images, categories, prices and
 * characteristics. The storefront's own code does not change.
 *
 * Only a stage site's key reaches the changeset table. A main site's key, or
 * any key that is not a stage site's, leaves the answer as it came without a
 * single changeset read: the live shop never shows what is only staged.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Every staged product op of one main site, oldest changeset first. */
export type ProductOverlay = {
  ops: ChangesetOp[];
  /** Category rows the ops name, so an overlaid product keeps names and handles. */
  categories: Map<string, Record<string, unknown>>;
};

const PRICE_FIELDS = [
  "calculated_amount",
  "original_amount",
  "calculated_amount_with_tax",
  "calculated_amount_without_tax",
  "original_amount_with_tax",
  "original_amount_without_tax",
];

const overlayVariant = (variant: Record<string, unknown>, op: ChangesetOp): Record<string, unknown> => {
  const prices = pricesOf(op.body?.prices);
  const next: Record<string, unknown> = { ...variant };

  if (Array.isArray(variant.prices)) {
    next.prices = prices.map((price) => ({ ...price }));
  }

  if (isRecord(variant.calculated_price)) {
    const currency = String(variant.calculated_price.currency_code ?? "").toLowerCase();
    const price = prices.find((candidate) => candidate.currency_code === currency);
    if (price) {
      const calculated: Record<string, unknown> = { ...variant.calculated_price };
      for (const field of PRICE_FIELDS) {
        if (field in calculated) calculated[field] = price.amount;
      }
      next.calculated_price = calculated;
    }
  }

  return next;
};

/** One product with every op aimed at it applied, in order. */
export const overlayProduct = (
  product: Record<string, unknown>,
  overlay: ProductOverlay,
): Record<string, unknown> => {
  let next = product;

  for (const op of overlay.ops) {
    if (productIdOf(op) !== product.id) continue;
    const rule = classifyOp(op.method, op.path);
    if (rule.verdict !== "allow") continue;
    const body = op.body ?? {};

    if (rule.kind === "product") {
      next = { ...next };
      for (const key of ["title", "subtitle", "description", "thumbnail"]) {
        if (key in body && key in next) next[key] = body[key];
      }
      if (Array.isArray(body.images) && "images" in next) {
        next.images = body.images.filter(isRecord).map((image, index) => ({
          id: `stage_image_${index}`,
          url: image.url,
          rank: index,
        }));
      }
      if (Array.isArray(body.categories) && "categories" in next) {
        next.categories = body.categories
          .filter(isRecord)
          .map((category) => overlay.categories.get(String(category.id)) ?? { id: category.id });
      }
    }

    if (rule.kind === "variant" && Array.isArray(next.variants)) {
      const variantId = variantIdOf(op);
      next = {
        ...next,
        variants: next.variants.map((variant) =>
          isRecord(variant) && variant.id === variantId ? overlayVariant(variant, op) : variant,
        ),
      };
    }
  }

  return next;
};

/** `product_attributes` of one product with the staged values in place. */
export const overlayAttributes = (
  rows: unknown[],
  productId: string,
  overlay: ProductOverlay,
): unknown[] => {
  const staged = new Map<string, unknown>();
  for (const op of overlay.ops) {
    if (productIdOf(op) !== productId) continue;
    const rule = classifyOp(op.method, op.path);
    if (rule.verdict !== "allow" || rule.kind !== "attributes") continue;
    for (const entry of Array.isArray(op.body?.values) ? op.body.values : []) {
      if (isRecord(entry)) staged.set(String(entry.key), entry.value ?? null);
    }
  }
  if (!staged.size) return rows;

  return rows
    .map((row) =>
      // The option label is the value's own; a staged value's label is not
      // known here, so the storefront shows the value itself.
      isRecord(row) && staged.has(String(row.key))
        ? { ...row, value: staged.get(String(row.key)), label: null }
        : row,
    )
    .filter((row) => !isRecord(row) || (row.value !== null && row.value !== ""));
};

/** A Store answer with the overlay applied wherever it carries products or characteristics. */
export const overlayAnswer = (body: unknown, overlay: ProductOverlay, productId: string | null): unknown => {
  if (!isRecord(body) || !overlay.ops.length) return body;
  const next: Record<string, unknown> = { ...body };

  if (isRecord(body.product)) next.product = overlayProduct(body.product, overlay);
  if (Array.isArray(body.products)) {
    next.products = body.products.map((product) => (isRecord(product) ? overlayProduct(product, overlay) : product));
  }
  if (Array.isArray(body.product_attributes) && productId) {
    const rows = overlayAttributes(body.product_attributes, productId, overlay);
    next.product_attributes = rows;
    if ("count" in body) next.count = rows.length;
  }

  return next;
};

// ---- reading the staged ops

const OVERLAY_PATHS = [/^\/store\/products(\/[^/]+)?\/?$/, /^\/store\/tenant\/product-attributes\/?$/];

/** Which main site a publishable key's stage site previews; cached for a minute per key. */
const stageCache = new Map<string, { main: string | null; at: number }>();
const CACHE_MS = 60_000;

const mainSiteBehindKey = async (req: MedusaRequest): Promise<string | null> => {
  const key = req.get("x-publishable-api-key") ?? "";
  if (!key) return null;
  const cached = stageCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.main;

  const tenant = await resolveTenantFromPublishableKeyHeader(req);
  const main = tenant ? stageOf(tenant.metadata) : null;
  stageCache.set(key, { main, at: Date.now() });
  return main;
};

export const loadProductOverlay = async (req: MedusaRequest, mainTenantId: string): Promise<ProductOverlay> => {
  const service: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  const staged = await service.listAgentChangesets(
    { tenant_id: mainTenantId, status: "staged" },
    { order: { staged_at: "ASC" } },
  );

  const ops = staged
    .flatMap((changeset) => (Array.isArray(changeset.ops) ? (changeset.ops as unknown as ChangesetOp[]) : []))
    .filter((op) => {
      const rule = classifyOp(op.method, op.path);
      return rule.verdict === "allow" && rule.scope === "product";
    });

  const categoryIds = [
    ...new Set(
      ops.flatMap((op) =>
        Array.isArray(op.body?.categories) ? op.body.categories.filter(isRecord).map((c) => String(c.id)) : [],
      ),
    ),
  ];
  const categories = new Map<string, Record<string, unknown>>();
  if (categoryIds.length) {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const { data } = await query.graph({
      entity: "product_category",
      fields: ["id", "name", "handle", "parent_category_id"],
      filters: { id: categoryIds },
    });
    for (const row of data as Record<string, unknown>[]) categories.set(String(row.id), row);
  }

  return { ops, categories };
};

/**
 * On `/store/*`, GET only. Any request that is not a product read, or whose
 * key is not a stage site's, passes untouched.
 */
export async function overlayStagedProductsOnAnswer(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
) {
  const path = (req.originalUrl ?? req.url ?? "").split("?")[0];
  if (req.method !== "GET" || !OVERLAY_PATHS.some((pattern) => pattern.test(path))) {
    return next();
  }

  try {
    const mainId = await mainSiteBehindKey(req);
    if (!mainId) return next();

    const overlay = await loadProductOverlay(req, mainId);
    if (!overlay.ops.length) return next();

    const productId =
      typeof req.query?.product_id === "string" ? (req.query.product_id as string) : null;
    const original = res.json.bind(res);
    (res as { json: (body: unknown) => MedusaResponse }).json = (body: unknown) =>
      original(overlayAnswer(body, overlay, productId) as never);
  } catch (error) {
    // A preview that cannot be built leaves the stage answer as it came; it
    // never fails the storefront's request.
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).warn(`agent changeset overlay skipped: ${(error as Error).message}`);
  }

  return next();
}

/** For tests: forget the cached key → site answers. */
export const resetOverlayCache = () => stageCache.clear();
