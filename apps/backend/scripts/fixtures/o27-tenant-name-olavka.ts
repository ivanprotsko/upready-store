import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { TENANT_MODULE } from "../../src/modules/tenant";
import type TenantModuleService from "../../src/modules/tenant/service";
import { notifyStorefrontRevalidate } from "../../src/storefront-revalidate";

/**
 * Renames the shop `cherkashino` (host olavka.com) to «ОЛАВКА» — Ivan 2026-09-25,
 * remark 2 on the olavka redesign (t-2026-09-24-n15): «название магазина нужно
 * указать "ОЛАВКА" вместо "Оксана Черкашина"». The field is `tenant.name`: the
 * storefront reads it through `/storefront/by-host` (middleware → `x-tenant-name`
 * → `getSiteName()`) for the header wordmark, the page titles, the footer and the
 * emails. Capitals by Ivan's decision (2026-09-25: «по названию — пиши «ОЛАВКА»
 * капсом везде»). The legal seller block (ИП) lives in the tenant's legal
 * settings and is not touched.
 *
 *   npx medusa exec ./scripts/fixtures/o27-tenant-name-olavka.ts
 *   DRY_RUN=1 npx medusa exec ./scripts/fixtures/o27-tenant-name-olavka.ts
 *
 * Idempotent: a tenant already named «ОЛАВКА» is left alone. The storefront
 * picks the new name up when its by-host cache entry expires (in-memory TTL,
 * `lib/tenant/resolve.ts`) — or on restart.
 */

const TENANT_HANDLE = "cherkashino";
const NAME = "ОЛАВКА";

export default async function renameTenantOlavka({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);
  const dryRun = process.env.DRY_RUN === "1";

  const [tenant] = await tenantModuleService.listTenants({ handle: TENANT_HANDLE });
  if (!tenant) {
    throw new Error(`o27-tenant-name-olavka: no tenant with handle "${TENANT_HANDLE}"`);
  }

  if (tenant.name === NAME) {
    logger.info(`o27-tenant-name-olavka: nothing to change, «${NAME}» already`);
    return;
  }

  if (dryRun) {
    logger.info(`o27-tenant-name-olavka: DRY_RUN — would rename «${tenant.name}» → «${NAME}»`);
    return;
  }

  await tenantModuleService.updateTenants({ id: tenant.id, name: NAME });
  logger.info(`o27-tenant-name-olavka: renamed «${tenant.name}» → «${NAME}» (tenant ${tenant.id})`);
  await notifyStorefrontRevalidate({ type: "tenant.home", handle: tenant.handle });
}
