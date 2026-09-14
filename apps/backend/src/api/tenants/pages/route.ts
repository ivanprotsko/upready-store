import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import { getTenantScope } from "../tenant-scope";
import { fillPageList, parsePageLocale } from "./page-helpers";

/**
 * `GET /tenants/pages` — the five content sections of the tenant behind the
 * token, always all five (`docs/tenant-panel/api-contract.md`, "Piece 7"), so
 * the panel's list screen renders one row per section without knowing the key
 * vocabulary itself. An unsaved section comes back as
 * `{ id: null, title: "", body: "", published: false }`.
 *
 * Scope is the tenant from `getTenantScope`, read off the token, never a query
 * parameter: `tenant_id` is always in the filter, so this list can never widen
 * to another tenant's rows the way an `undefined` id filter would.
 *
 * Not an Admin-shaped list: there is no Admin counterpart to reuse a validator
 * or a query config from, and the response is the whole fixed set rather than
 * a page of it, so it carries no `count/offset/limit`. That is the contract's
 * own shape for this route.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const locale = parsePageLocale(req.query.locale);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const rows = await tenantModuleService.listTenantPages({
    tenant_id: scope.id,
    locale,
  });

  res.json({ pages: fillPageList(rows, locale) });
};
