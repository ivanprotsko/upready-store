import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import upsertTenantLocaleSettingsWorkflow from "../../src/workflows/tenant/upsert-tenant-locale-settings";

/**
 * FIXTURE ONLY — t-cherk-34 acceptance. Points the `cherkashino-com` stand-in
 * site's default locale/currency at English/USD (brief bullet 3): the real
 * owner would do this once from the panel's language screen
 * (`PUT /tenants/locale-settings`), which needs a tenant_admin bearer token
 * this stand has no password for, so this calls the same workflow directly.
 *
 *   npx medusa exec ./scripts/fixtures/t-cherk-34-set-locale.ts
 *
 * Run AFTER `ensure-international-region.ts` has put "us" into the
 * International region — `default_country` only changes which country a
 * first-time visitor lands on, not which region/currency that country prices
 * in, but a country the region does not list would be a first-time visitor
 * pinned to a country no Medusa region recognises.
 */
export default async function setCherkashinoComLocale({ container }: { container: MedusaContainer }) {
  const logger: Logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [tenant],
  } = await query.graph({
    entity: "tenant",
    fields: ["id", "handle"],
    filters: { handle: "cherkashino-com" },
  });

  if (!tenant?.id) {
    logger.error("t-cherk-34 fixture: no tenant with handle \"cherkashino-com\" — clone it first.");
    return;
  }

  await upsertTenantLocaleSettingsWorkflow(container).run({
    input: {
      tenant_id: tenant.id as string,
      default_locale: "en",
      enabled_locales: ["en", "ru"],
      default_country: "us",
    },
  });

  logger.info(`t-cherk-34 fixture: "${tenant.handle}" now defaults to en/us.`);
}
