import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import { pickPageForLocale, requestedPageLocale } from "../../../tenants/pages/page-helpers";
import { resolveTenantFromPublishableKey } from "../resolve-tenant";

/**
 * `GET /store/tenant/pages` — the published, footer-linked pages of the
 * storefront's own tenant, for the footer's Information column:
 * `{ pages: [{ key, title, locale }] }`.
 *
 * t05-page-keys widened this from the fixed five to any page the owner marked
 * `in_footer`: one entry per key in the visitor's locale (`x-medusa-locale` /
 * `?locale=`), falling back per `pickPageForLocale`. The storefront keys its
 * fetch cache by the `?locale=` it sends, so one language can no longer fill
 * the cache for every visitor (the reason the first version read `en` alone).
 *
 * Order is the owner's own: ascending `footer_order` (a page with none sorts
 * after every page that has one), then title, so two pages saved without an
 * explicit position still come back in a stable order rather than the
 * database's.
 */
export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req);
  const requested = requestedPageLocale(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  const rows = await tenantModuleService.listTenantPages({
    tenant_id: tenant.id,
    published: true,
    in_footer: true,
  });

  const byKey = new Map<string, typeof rows>();
  for (const row of rows) {
    const group = byKey.get(row.key) ?? [];
    group.push(row);
    byKey.set(row.key, group);
  }

  const picked = [...byKey.values()]
    .map((group) => pickPageForLocale(group, requested))
    .filter((row): row is NonNullable<typeof row> => row !== null);

  picked.sort((a, b) => {
    const orderA = a.footer_order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.footer_order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.title.localeCompare(b.title);
  });

  const pages = picked.map((row) => ({ key: row.key, title: row.title, locale: row.locale }));
  res.json({ pages });
};
