import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import { resolveTenantDomain } from "../../../tenant-legal/domain";
import {
  LEGAL_TOKEN_LABELS,
  LEGAL_TOKEN_FIELDS,
  missingLegalTokens,
  tokensInText,
  type LegalToken,
  type RequisitesRow,
} from "../../../tenant-legal/requisites";
import { ensureRequisites, type TenantRequisitesRecord } from "../../../tenant-legal/shop";
import { getTenantScope } from "../tenant-scope";

/**
 * Plain-Russian labels for the five reserved page sections, duplicated from
 * `apps/tenant-panel/src/routes/pages/page-sections.ts` on purpose — that file
 * is the panel's own bundle and this backend route has no build-time access to
 * it, the same reason `page-helpers.ts` does not import the panel either. A
 * custom page has no entry here and falls back to its own title.
 */
const RESERVED_PAGE_LABELS: Record<string, string> = {
  contacts: "Контакты",
  legal: "Реквизиты",
  about: "О магазине",
  privacy: "Политика конфиденциальности",
  offer: "Публичная оферта",
};

export type MissingRequisiteView = {
  token: string;
  label: string;
  /** The pages (this tenant's own) whose body literally carries this token. */
  pages: { key: string; title: string }[];
};

export type RequisitesView = {
  requisites: Omit<RequisitesRow, never>;
  /** `{{ДОМЕН_САЙТА}}`'s resolved value — read-only here, never a form field. */
  domain: string;
  missing: MissingRequisiteView[];
};

const REQUISITES_FIELDS = [
  "legal_name",
  "inn",
  "ogrn",
  "legal_address",
  "return_address",
  "phone",
  "phone_confirmed",
  "email",
  "dpo_email",
  "delivery_methods",
  "effective_date",
  "revision_date",
  "document_date",
  "rkn_notice_date",
  "rkn_reg_number",
  "newsletter_management_url",
  "bank_details",
] as const satisfies readonly (keyof RequisitesRow)[];

const toRow = (record: TenantRequisitesRecord): RequisitesRow => {
  const row = {} as RequisitesRow;
  for (const field of REQUISITES_FIELDS) {
    (row[field] as unknown) = record[field] ?? (field === "phone_confirmed" ? false : null);
  }
  return row;
};

/**
 * The "Не заполнено: …" list (step plan piece 3): every one of the 16 tokens
 * with no value, alongside every one of THIS tenant's own pages (reserved or
 * custom, published or draft — a draft still needs the same fix before it can
 * publish) whose body literally names it. A token nobody's page uses is still
 * listed, with an empty `pages` array, since a page not yet written may still
 * need it tomorrow.
 */
const missingView = async (
  tenantModuleService: TenantModuleService,
  tenantId: string,
  row: RequisitesRow,
  domain: string,
): Promise<MissingRequisiteView[]> => {
  const missing = missingLegalTokens(row, domain);
  if (!missing.length) return [];

  const pages = await tenantModuleService.listTenantPages({ tenant_id: tenantId });
  const byToken = new Map<LegalToken, { key: string; title: string }[]>();

  for (const page of pages) {
    const used = tokensInText(page.body ?? "");
    if (!used.length) continue;
    const view = { key: page.key, title: RESERVED_PAGE_LABELS[page.key] ?? page.title ?? page.key };
    for (const token of used) {
      const list = byToken.get(token) ?? [];
      list.push(view);
      byToken.set(token, list);
    }
  }

  return missing.map((token) => ({
    token,
    label: LEGAL_TOKEN_LABELS[token],
    pages: byToken.get(token) ?? [],
  }));
};

export const ownRequisites = async (
  req: AuthenticatedMedusaRequest,
): Promise<{ tenant: Awaited<ReturnType<typeof getTenantScope>>; record: TenantRequisitesRecord }> => {
  const tenant = await getTenantScope(req);
  const record = await ensureRequisites(req.scope, tenant.id);
  return { tenant, record };
};

export const requisitesView = async (
  req: AuthenticatedMedusaRequest,
  tenant: { id: string; handle: string },
  record: TenantRequisitesRecord,
): Promise<RequisitesView> => {
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  const domain = await resolveTenantDomain(req.scope, tenant, req.headers.host);
  const row = toRow(record);

  return {
    requisites: row,
    domain,
    missing: await missingView(tenantModuleService, tenant.id, row, domain),
  };
};

/** Every field a PUT body may carry, matching `LEGAL_TOKEN_FIELDS` plus `bank_details`. */
export const WRITABLE_REQUISITES_FIELDS = [
  ...(Object.values(LEGAL_TOKEN_FIELDS) as (keyof RequisitesRow)[]),
  "bank_details",
] as const;
