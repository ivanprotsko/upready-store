import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import upsertTenantHomeWorkflow from "../../../workflows/tenant/upsert-tenant-home";
import { notifyStorefrontRevalidate } from "../../../storefront-revalidate";
import { getTenantScope, listTenantCategoryIds, listTenantProductIds } from "../tenant-scope";
import { readTenantHomeDocument } from "./document";
import { carryTemplateOver } from "./template/apply";
import {
  isForbidden,
  TENANT_HOME_SCHEMA_ID,
  type HomeBanner,
  type PutTenantHomeBodyType,
  type TenantHomeDocument,
} from "./validators";
import type { StorefrontSettingsInput } from "../../store/storefront-settings/validation";

/**
 * `GET`/`PUT /tenants/home` — the tenant's home-page document
 * (`upready.tenant-home/v1`, `docs/tenant-panel/api-contract.md` "Piece 8").
 * One row per tenant in `tenant_home_config`, written by the panel's
 * `/home-settings` screen and read by that tenant's storefront through the
 * public `GET /store/tenant/home`.
 *
 * Scope: the tenant behind the token, never a body field. The row is addressed
 * by `tenant_id`, so there is no id in the URL to leak and no foreign row to
 * reach; the one foreign reference a body can carry, `content.products.
 * category_id`, is checked against the tenant-product-category link below.
 *
 * The write is the contract's own "upsert via the tenant module service",
 * wrapped in a one-step workflow the way `POST /tenants/me` wraps its own
 * update (`workflows/tenant/upsert-tenant-home`): the service call is the step's
 * body, and the step carries the compensation that puts the previous document
 * back. A bare service call from the route would also trip the repo's own lint
 * rule `@medusajs/no-service-mutations-in-api-route`.
 */

const resolveBannerLinks = async (
  req: AuthenticatedMedusaRequest,
  banners: HomeBanner[],
): Promise<HomeBanner[]> => {
  const productIds = banners.flatMap((b) => (b.link.type === "product" ? [b.link.product_id] : []));
  if (!productIds.length) {
    return banners;
  }

  const owned = await listTenantProductIds(req);
  const foreign = productIds.find((id) => !owned.includes(id));
  if (foreign) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "content.banners[].link.product_id must name a product of your own.",
    );
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
    filters: { id: productIds },
  });
  const handleOf = new Map(products.map((p) => [p.id as string, (p.handle as string) ?? ""]));

  return banners.map((banner) =>
    banner.link.type === "product"
      ? { ...banner, link: { ...banner.link, handle: handleOf.get(banner.link.product_id) ?? banner.link.handle } }
      : banner,
  );
};

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const existing = await readTenantHomeDocument(req.scope, tenant.id);

  res.json({ home: existing?.document ?? null });
};

export const PUT = async (
  req: AuthenticatedMedusaRequest<PutTenantHomeBodyType>,
  res: MedusaResponse,
) => {
  const tenant = await getTenantScope(req);
  const body = req.validatedBody;
  const settings = body.settings as unknown as StorefrontSettingsInput;

  // The FORBIDDEN pair is a 422, the same status and the same body
  // `PUT /store/storefront-settings` already answers with, so the panel renders
  // one failure frame for either route. It is written here rather than thrown as
  // a MedusaError because the framework's error handler maps no MedusaError type
  // to 422 except DUPLICATE_ERROR and PAYMENT_AUTHORIZATION_ERROR, neither of
  // which describes a composition that two saved values forbid
  // (@medusajs/framework/dist/http/middlewares/error-handler.js).
  const forbidden = isForbidden(settings);
  if (forbidden) {
    res.status(422).json({
      error: "forbidden_combination",
      // `message` is not part of the storefront-settings body; it is added here
      // because the js-sdk's FetchError carries only `message` (it falls back to
      // the status text), and without it the panel would show "Unprocessable
      // Entity" instead of the reason the pair is blocked.
      message: forbidden.reason,
      field: forbidden.field,
      value: forbidden.value,
      against: forbidden.against,
      againstValue: forbidden.againstValue,
      reason: forbidden.reason,
    });
    return;
  }

  // A category the tenant does not own is INVALID_DATA (400), not 404: the id is
  // a field of the document being written, not the resource being addressed, and
  // the message names no category, so the answer says nothing about whether a
  // foreign id exists.
  if (body.content.products.source === "category") {
    const ownedCategoryIds = await listTenantCategoryIds(req);
    if (!ownedCategoryIds.includes(body.content.products.category_id)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "content.products.category_id must name a category of your own.",
      );
    }
  }

  // Banners (t-2026-09-24-n15): a product link must name a product of THIS tenant
  // — same INVALID_DATA rule as the category above — and the handle stored beside
  // the id is the product's own, read here rather than trusted from the client.
  const banners = await resolveBannerLinks(req, body.content.banners ?? []);

  // A template the shop applied (`POST /tenants/home/template`, t-2026-10-12-33) is not in
  // this body: the panel's form does not know templates yet. It is carried over, its slot
  // sections following the settings just saved (`carryTemplateOver`), so a save of the
  // form does not drop the shop's choice. A shop with no template writes the document it
  // always wrote, key for key.
  const existing = await readTenantHomeDocument(req.scope, tenant.id);
  const { carried, reason } = carryTemplateOver(existing?.document ?? null, {
    settings,
    preset: body.theme.preset,
  });
  if (reason) {
    req.scope
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(`[tenants/home] ${tenant.handle}: the saved template no longer fits and is dropped: ${reason}`);
  }

  const document: TenantHomeDocument = carried
    ? {
        schema: TENANT_HOME_SCHEMA_ID,
        theme: { ...body.theme, layers: carried.layers },
        settings,
        content: { ...body.content, banners, sections: carried.sections },
        template: carried.template,
        updatedAt: new Date().toISOString(),
      }
    : {
        schema: TENANT_HOME_SCHEMA_ID,
        theme: body.theme,
        settings,
        content: { ...body.content, banners },
        updatedAt: new Date().toISOString(),
      };

  await upsertTenantHomeWorkflow(req.scope).run({
    input: { tenant_id: tenant.id, config: document },
  });

  // The storefront caches this document (tag `tenant-home-<handle>`), so without
  // this call the shop keeps rendering its previous theme, hero and home blocks
  // until the process restarts. The receiver has always understood the
  // `tenant.home` type — nobody was sending it (measured 2026-09-14: the only
  // caller of /api/revalidate in this app was the product subscriber).
  await notifyStorefrontRevalidate({ type: "tenant.home", handle: tenant.handle });

  res.json({ home: document });
};
