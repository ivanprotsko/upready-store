import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import { isReservedPageKey } from "../../../../modules/tenant/models/tenant-page";
import type { PutTenantPageBody } from "../../validators";
import { getTenantScope } from "../../tenant-scope";
import { assertPageKey, blankPage, parsePageLocale, toPageDto } from "../page-helpers";
import { notifyStorefrontRevalidate } from "../../../../storefront-revalidate";

/**
 * `GET /tenants/pages/:key` — one page of the tenant behind the token. A key
 * that is neither a saved row nor one of the five reserved ones is a 404
 * (`assertPageKey` rejects a malformed one the same way); a reserved key the
 * tenant has not saved yet answers the blank shape with `id: null`, so the
 * panel's edit screen opens on an empty form for it instead of erroring. A
 * custom page not yet created is also a 404 — it is `POST /tenants/pages`
 * that brings one into existence.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const key = assertPageKey(req.params.key);
  const locale = parsePageLocale(req.query.locale);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const [row] = await tenantModuleService.listTenantPages({
    tenant_id: scope.id,
    key,
    locale,
  });

  if (row) {
    res.json({ page: toPageDto(row) });
    return;
  }

  if (isReservedPageKey(key)) {
    res.json({ page: blankPage(key, locale) });
    return;
  }

  throw new MedusaError(MedusaError.Types.NOT_FOUND, `Page with key "${key}" was not found`);
};

/**
 * `PUT /tenants/pages/:key` — upsert of one page. The tenant id comes from the
 * token through `getTenantScope`, the key from the path, and the row is
 * looked up by the triple (`tenant_id`, `key`, `locale`) the model's own unique
 * index is built on, which is what makes this an upsert rather than two
 * routes: the update branch only ever touches a row that already carries this
 * tenant's id, so there is no foreign row to check ownership on.
 *
 * A reserved key upserts on write, same as before t05-page-keys (a tenant that
 * has never touched "offer" still gets a row the first time it publishes one).
 * A custom key does not: it must already exist, created by `POST
 * /tenants/pages`, or this is `NOT_FOUND` — the slug's own validity and this
 * tenant's uniqueness are `POST`'s checks, and a PUT that skipped them could
 * plant an unreserved key with none of that scrutiny.
 *
 * `published: true` with a blank title is `INVALID_DATA`: the storefront's
 * footer link and the page heading are that title, and an empty one would ship
 * a nameless link to shoppers. A blank title on a draft is fine.
 */
export const PUT = async (
  req: AuthenticatedMedusaRequest<PutTenantPageBody>,
  res: MedusaResponse,
) => {
  const scope = await getTenantScope(req);
  const key = assertPageKey(req.params.key);
  const body = req.validatedBody;
  const locale = parsePageLocale(body.locale);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  if (body.published && body.title.trim().length === 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid request: a published page needs a title",
    );
  }

  const [existing] = await tenantModuleService.listTenantPages({
    tenant_id: scope.id,
    key,
    locale,
  });

  if (!existing && !isReservedPageKey(key)) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Page with key "${key}" was not found`);
  }

  // `in_footer`/`footer_order` are optional in the body (a caller written
  // before t05-page-keys never sends them): an update leaves the field at
  // its current value, a fresh row falls back to the reserved key's own old
  // default (every published one of the five used to show in the footer
  // unconditionally) or "off" for a brand new custom page.
  const inFooter =
    body.in_footer ?? existing?.in_footer ?? isReservedPageKey(key);
  const footerOrder =
    body.footer_order !== undefined ? body.footer_order : existing?.footer_order ?? null;
  const seoTitle =
    body.seo_title !== undefined ? body.seo_title || null : existing?.seo_title ?? null;
  const seoDescription =
    body.seo_description !== undefined
      ? body.seo_description || null
      : existing?.seo_description ?? null;

  const saved = existing
    ? await tenantModuleService.updateTenantPages({
        id: existing.id,
        title: body.title,
        body: body.body,
        published: body.published,
        in_footer: inFooter,
        footer_order: footerOrder,
        seo_title: seoTitle,
        seo_description: seoDescription,
      })
    : await tenantModuleService.createTenantPages({
        tenant_id: scope.id,
        key,
        locale,
        title: body.title,
        body: body.body,
        published: body.published,
        in_footer: inFooter,
        footer_order: footerOrder,
        seo_title: seoTitle,
        seo_description: seoDescription,
      });

  const row = Array.isArray(saved) ? saved[0] : saved;

  // Same reason as the home document: the page bodies AND the footer's link list
  // hang off the shared `tenant-pages` tag, so an unsent notification leaves both
  // stale on the shop.
  await notifyStorefrontRevalidate({ type: "tenant.pages", handle: scope.handle });

  res.json({ page: toPageDto(row) });
};

/**
 * `DELETE /tenants/pages/:key` (t05-page-keys) — removes a custom page. A
 * reserved key cannot be deleted: the footer, the storefront routes and the
 * seam tests all depend on the five always existing (as a blank at worst), so
 * this is `INVALID_DATA` rather than a silent no-op. Deleting an unsaved or
 * foreign key is a 404, the same answer the GET above gives for it — nothing
 * here tells a caller whether a key belongs to another tenant.
 */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const key = assertPageKey(req.params.key);

  if (isReservedPageKey(key)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid request: "${key}" is a reserved page key and cannot be deleted`,
    );
  }

  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  const rows = await tenantModuleService.listTenantPages({
    tenant_id: scope.id,
    key,
  });

  if (!rows.length) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Page with key "${key}" was not found`);
  }

  await tenantModuleService.deleteTenantPages(rows.map((row) => row.id));
  await notifyStorefrontRevalidate({ type: "tenant.pages", handle: scope.handle });

  res.json({ id: key, object: "tenant_page", deleted: true });
};
