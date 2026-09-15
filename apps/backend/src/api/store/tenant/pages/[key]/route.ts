import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../../../modules/tenant";
import type TenantModuleService from "../../../../../modules/tenant/service";
import { pickPageForLocale, requestedPageLocale, toPageDto } from "../../../../tenants/pages/page-helpers";
import { resolveTenantFromPublishableKey } from "../../resolve-tenant";
import { resolveTenantDomain } from "../../../../../tenant-legal/domain";
import { readRequisites } from "../../../../../tenant-legal/shop";
import { valuesFromRequisites } from "../../../../../tenant-legal/requisites";
import { redactLegalPlaceholders } from "../../../../../tenant-legal/redact";

/**
 * `GET /store/tenant/pages/:key` — one published page of the storefront's own
 * tenant, in the visitor's locale when that row exists, otherwise per the
 * fallback chain of `pickPageForLocale` (language part → `en` → any). A draft
 * or an unwritten key is a 404, the same answer for both, so the storefront
 * cannot tell an unpublished page from a missing one.
 *
 * The body is returned with its `{{ТОКЕН}}` placeholders resolved against this
 * tenant's own requisites (t12-legal-requisites, `tenant-legal/requisites.ts`)
 * — the ONE place this happens, so every visitor sees the same result. A
 * neighbouring tenant's requisites never reach this response: both the page
 * row and the requisites row are looked up by THIS tenant's id alone.
 *
 * A token with NO value no longer reaches the buyer at all: the block carrying
 * it is hidden (`tenant-legal/redact.ts`, b02-legal-and-redirects), and the
 * owner is told which pages lost blocks on the panel's «Реквизиты продавца»
 * screen. Until this task the placeholder was printed literally — on the live
 * shop that was 42 visible `{{ТОКЕНОВ}}` on `/ru/pages/contacts` and 46 in the
 * offer (`artifacts/q03-gap-recheck/gap-recheck.md` §3).
 */
export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req);
  const key = req.params.key;
  const requested = requestedPageLocale(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  const rows = await tenantModuleService.listTenantPages({
    tenant_id: tenant.id,
    key,
    published: true,
  });
  const row = pickPageForLocale(rows, requested);
  if (!row) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Page with key "${key}" was not found`);
  }

  const [requisites, domain] = await Promise.all([
    readRequisites(req.scope, tenant.id),
    resolveTenantDomain(req.scope, tenant, req.headers.host),
  ]);
  const values = valuesFromRequisites(requisites, domain);
  const dto = toPageDto(row);

  const redacted = redactLegalPlaceholders(dto.body, values);

  res.json({ page: { ...dto, body: redacted.body } });
};
