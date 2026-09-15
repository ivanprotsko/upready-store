import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../src/modules/tenant";
import type TenantModuleService from "../../src/modules/tenant/service";

/**
 * Acceptance fixture for b14-pages-legal-content: fills every one of the 15
 * stored requisites of a tenant with an OBVIOUSLY FAKE value, so the
 * `/ru/pages/legal` page can be measured in its "all filled" state — the
 * acceptance criterion asks for a page with no `{{ТОКЕН}}` left on it.
 *
 * Never run this against the live shop. The real values are the owner's to
 * enter in the panel, and `src/scripts/prefill-cherkashino-requisites.ts` is
 * the only script allowed to write the five that ARE on file.
 *
 *   npx medusa exec ./scripts/fixtures/b14-fill-requisites.ts
 *   npx medusa exec ./scripts/fixtures/b14-fill-requisites.ts clear
 */
const TENANT_HANDLE = "cherkashino";

const FAKE: Record<string, string> = {
  legal_name: "ИП Тестовая Тестова Тестовна (ФИКСТУРА)",
  inn: "000000000000",
  ogrn: "000000000000000",
  legal_address: "000000, г. Тестоград, ул. Фикстурная, д. 1 (ФИКСТУРА)",
  return_address: "000000, г. Тестоград, ул. Фикстурная, д. 1, ПВЗ (ФИКСТУРА)",
  phone: "+7 (000) 000-00-00",
  email: "fixture@example.invalid",
  dpo_email: "fixture-dpo@example.invalid",
  delivery_methods: "Самовывоз, курьером по городу (ФИКСТУРА)",
  effective_date: "01.01.2026",
  revision_date: "01.01.2026",
  document_date: "01.01.2026",
  rkn_notice_date: "01.01.2026",
  rkn_reg_number: "00-00-000000 (ФИКСТУРА)",
  newsletter_management_url: "https://example.invalid/unsubscribe",
};

export default async function b14FillRequisites({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);
  const clear = args.includes("clear");

  const [tenant] = await tenantModuleService.listTenants({ handle: TENANT_HANDLE });
  if (!tenant) {
    logger.info(`b14-fill-requisites: no tenant "${TENANT_HANDLE}".`);
    return;
  }

  const patch: Record<string, string | boolean | null> = {};
  for (const field of Object.keys(FAKE)) {
    patch[field] = clear ? null : FAKE[field];
  }
  patch.phone_confirmed = !clear;

  const [existing] = await tenantModuleService.listTenantRequisites({ tenant_id: tenant.id });

  if (existing) {
    await tenantModuleService.updateTenantRequisites({ id: existing.id, ...patch });
  } else {
    await tenantModuleService.createTenantRequisites({ tenant_id: tenant.id, ...patch });
  }

  logger.info(
    `b14-fill-requisites: ${TENANT_HANDLE} — ${clear ? "cleared" : "filled"} ${Object.keys(FAKE).length} fields.`,
  );
}
