import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../src/modules/tenant";
import type TenantModuleService from "../../src/modules/tenant/service";

/**
 * b08-seo-storefront — acceptance fixture ONLY, outside `src/` for the reason
 * `scripts/fixtures/README.md` gives.
 *
 * The 301 table for a migrated shop's CONTENT pages is derived, not listed:
 * `src/tenant-redirects/migrated-pages.ts` knows 15 old addresses and writes a
 * row only for the ones whose page the shop actually has. Ten of them are
 * waiting for a page nobody has created yet (`b14-pages-legal-content` owns
 * that), so the "it appears by itself once the page exists" half of the claim
 * has nothing to measure on a shop as it stands.
 *
 * This fixture creates ONE of those pages on a stand, so the next
 * `backfill-tenant-redirects` run can be measured turning `/ru/ru/delivery`
 * from a 404 into a 301. It writes a tenant page and nothing else.
 *
 *   B08_TENANT=cherkashino B08_PAGE_KEY=delivery \
 *   npx medusa exec ./scripts/fixtures/b08-seed-delivery-page.ts
 */
export default async function seedDeliveryPage({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

  const handle = process.env.B08_TENANT ?? "cherkashino";
  const key = process.env.B08_PAGE_KEY ?? "delivery";
  const locale = process.env.B08_PAGE_LOCALE ?? "ru";

  const [tenant] = await tenantModuleService.listTenants({ handle });
  if (!tenant) {
    throw new Error(`b08-seed-delivery-page: no tenant with handle "${handle}"`);
  }

  const [existing] = await tenantModuleService.listTenantPages({
    tenant_id: tenant.id,
    key,
    locale,
  });

  if (existing) {
    logger.info(`b08-seed-delivery-page: ${handle}/${key} (${locale}) already exists — nothing to do`);
    return;
  }

  const [page] = await tenantModuleService.createTenantPages([
    {
      tenant_id: tenant.id,
      key,
      locale,
      title: "Доставка и оплата",
      body: "Тестовая страница стенда b08: доставка СДЭК и Почтой России, оплата картой.",
      published: true,
      in_footer: false,
    },
  ]);

  logger.info(`b08-seed-delivery-page: created ${handle}/${key} (${locale}) — ${page.id}`);
}
