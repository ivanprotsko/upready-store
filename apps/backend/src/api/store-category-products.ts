import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ProductStatus } from "@medusajs/framework/utils";

/**
 * A category answers on the Store API with its published products only
 * (t-2026-10-12-32, defect D3 of the 13.10.2026 audit).
 *
 * `field-guard.ts` opens `products` on a category, as the first segment of the
 * path, because the storefront counts a category's products: the menu's
 * fallback, the hero gallery's "N products" line and the category page's
 * skeleton (`apps/storefront/src/lib/util/category-products.ts`). The query
 * engine fills that relation with every linked product, drafts included, so
 * `GET /store/product-categories?fields=id,name,handle,*products` with the
 * shop's publishable key listed seven drafts of «Мёд» on cherkashino.ru, with
 * their titles and handles. The storefront drops them before it draws a page,
 * and a page is not the only reader: the key stands in the code of every page.
 *
 * The relation is filtered and not refused, because refusing it would zero the
 * storefront's counts. Two steps, one middleware:
 *   1. a request that expands `products` also asks for `products.status`, so
 *      the answer can tell a published product from a draft whatever columns
 *      the caller named;
 *   2. every `products` list inside a category answer keeps the products whose
 *      `status` is `published`. A product with no status is dropped, because
 *      nothing in the answer says it is public.
 *
 * Collections, tags and types need no step here: `field-guard.ts` opens no
 * relation under them, so `*products` never reaches the query engine there.
 * `/tenants/product-categories` is not under `/store`, so the shop panel lists
 * the drafts of its own categories as before.
 */

const PRODUCTS = "products";

const STATUS_FIELD = `+${PRODUCTS}.status`;

/** The keys a category answer carries its categories under, as Medusa's Store routes and `/store/tenant/product-categories` write them. */
const CATEGORY_ANSWER_KEYS = ["product_categories", "product_category"];

// A category tree is a handful of levels deep. The bound guards against a cycle
// in a hand-built object, the way `withCategoryProductRefs` on the storefront
// bounds its own walk.
const MAX_DEPTH = 12;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * True when one item of `?fields=` expands `products` of the route's own row.
 * Medusa reads `+x` and ` x` (a `+` decoded from a URL) as "add to the
 * defaults", `*x` as "x with every column", and `-x` as "take x away".
 */
const expandsProducts = (item: string): boolean => {
  const name = item.trim();
  return !name.startsWith("-") && name.replace(/^[+*]+/, "").split(".")[0] === PRODUCTS;
};

/** The caller's `fields` with `+products.status` added when they expand `products`, unchanged otherwise. */
export function withProductStatusField(fields: string): string {
  return fields.split(",").some(expandsProducts) ? `${fields},${STATUS_FIELD}` : fields;
}

/** One `products` list cut to published products, returned as it came when every product in it is published. */
const publishedOnly = (products: unknown[], depth: number): unknown[] => {
  const kept = products
    .filter((product) => isRecord(product) && product.status === ProductStatus.PUBLISHED)
    .map((product) => keepPublished(product, depth + 1));
  return kept.length === products.length && kept.every((product, index) => product === products[index])
    ? products
    : kept;
};

function keepPublished(value: unknown, depth: number): unknown {
  if (typeof value !== "object" || value === null || depth > MAX_DEPTH) {
    return value;
  }

  if (Array.isArray(value)) {
    let next: unknown[] | null = null;
    value.forEach((item, index) => {
      const cleaned = keepPublished(item, depth + 1);
      if (cleaned !== item) {
        next ??= [...value];
        next[index] = cleaned;
      }
    });
    return next ?? value;
  }

  let next: Record<string, unknown> | null = null;
  for (const [key, child] of Object.entries(value)) {
    const cleaned = key === PRODUCTS && Array.isArray(child) ? publishedOnly(child, depth) : keepPublished(child, depth + 1);
    if (cleaned !== child) {
      next ??= { ...value };
      next[key] = cleaned;
    }
  }
  return next ?? value;
}

/**
 * A category answer with every `products` list inside it, at any depth, cut to
 * published products. Any other answer, and a category answer with nothing to
 * cut, is returned as it came.
 */
export function keepPublishedCategoryProducts<T>(body: T): T {
  if (!isRecord(body) || !CATEGORY_ANSWER_KEYS.some((key) => key in body)) {
    return body;
  }

  let next: Record<string, unknown> | null = null;
  for (const key of CATEGORY_ANSWER_KEYS) {
    if (!(key in body)) continue;
    const cleaned = keepPublished(body[key], 0);
    if (cleaned !== body[key]) {
      next ??= { ...body };
      next[key] = cleaned;
    }
  }
  return (next ?? body) as T;
}

/**
 * Registered on `/store/*` after `guardRequestedFields`, for the reason the
 * guard gives: a wildcard runs before Medusa's own `validateAndTransformQuery`
 * reads `fields`. After the guard, `products` survives as the first segment on
 * the category routes only, so the status column is added there and nowhere
 * else. The answer side wraps `res.json` the way `allowStoreMetadataOnAnswer`
 * does, and acts on a category answer only.
 */
export function keepPublishedCategoryProductsOnAnswer(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
) {
  const query = req.query as Record<string, unknown>;
  if (typeof query?.fields === "string") {
    query.fields = withProductStatusField(query.fields);
  }

  const original = res.json.bind(res);
  (res as { json: (body: unknown) => MedusaResponse }).json = (body: unknown) =>
    original(keepPublishedCategoryProducts(body) as never);

  next();
}
