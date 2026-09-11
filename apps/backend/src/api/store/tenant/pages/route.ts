import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import { TENANT_PAGE_KEYS } from "../../../../modules/tenant/models/tenant-page";
import { DEFAULT_PAGE_LOCALE } from "../../../tenants/pages/page-helpers";
import { resolveTenantFromPublishableKey } from "../resolve-tenant";

/**
 * `GET /store/tenant/pages` — the published sections of the tenant behind the
 * storefront's publishable key, as `{ pages: [{ key, title }] }`. This is the
 * footer's link list, so it carries no bodies: the storefront fetches one page
 * body only on the page itself.
 *
 * Locale: the `en` row, always. The storefront reads this through
 * `fetchWithoutLocale` under ONE cache tag (`tenant-pages`), the same reason
 * `llms.txt` does (AGENTS.md, "Two pieces of locale plumbing") — a per-request
 * locale here would let whichever language filled the cache first be served to
 * every visitor. The panel edits only `en` today; a locale-aware read is a
 * later piece, and it needs a per-locale cache tag first.
 *
 * Order is `TENANT_PAGE_KEYS`' own, not the database's, so the footer column
 * reads the same on every storefront.
 */
export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const rows = await tenantModuleService.listTenantPages({
    tenant_id: tenant.id,
    locale: DEFAULT_PAGE_LOCALE,
    published: true,
  });

  const byKey = new Map(rows.map((row) => [row.key, row]));

  res.json({
    pages: TENANT_PAGE_KEYS.filter((key) => byKey.has(key)).map((key) => ({
      key,
      title: byKey.get(key)!.title,
    })),
  });
};
