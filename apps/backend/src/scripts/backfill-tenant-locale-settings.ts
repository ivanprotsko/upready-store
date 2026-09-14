import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";
import upsertTenantLocaleSettingsWorkflow from "../workflows/tenant/upsert-tenant-locale-settings";

/**
 * Gives every tenant that has never saved `tenant_locale_settings`
 * (t06-locale-currency) the shop's default: Russian first, English enabled,
 * no currency override (the deployment's own `LOCALE_COUNTRY_MAP`, or region
 * detection, decides the country). A tenant that already saved its own row —
 * through the panel, or an earlier run of this script — is left alone: the
 * script never overwrites a pick that "says otherwise".
 *
 * Idempotent: a second run finds every tenant already covered and patches
 * none.
 *
 * `medusa exec` hands a script's own flags through as bare, dash-less
 * positionals (measured 2026-09-15: a leading `--` before `--dry-run` is
 * swallowed by the CLI's own arg parser and never reaches `args` at all,
 * while `medusa exec ./script.js dry-run` does), so the switch is spelled
 * without dashes here.
 *
 *   docker exec mt-backend node_modules/.bin/medusa exec ./src/scripts/backfill-tenant-locale-settings.js
 *   docker exec mt-backend node_modules/.bin/medusa exec ./src/scripts/backfill-tenant-locale-settings.js dry-run
 */
const DEFAULT_LOCALE = "ru";
const ENABLED_LOCALES = ["ru", "en"];

export default async function backfillTenantLocaleSettings({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);
  const dryRun = args.includes("dry-run") || args.includes("--dry-run");

  const tenants = await tenantModuleService.listTenants({});
  const existing = await tenantModuleService.listTenantLocaleSettings({});
  const covered = new Set(existing.map((row) => row.tenant_id));

  let patched = 0;
  let skipped = 0;

  for (const tenant of tenants) {
    if (covered.has(tenant.id)) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      logger.info(
        `backfill-tenant-locale-settings: [dry-run] would set tenant ${tenant.id} (${tenant.handle}) to default_locale=${DEFAULT_LOCALE}, enabled_locales=${ENABLED_LOCALES.join(",")}`,
      );
      patched += 1;
      continue;
    }

    await upsertTenantLocaleSettingsWorkflow(container).run({
      input: {
        tenant_id: tenant.id,
        default_locale: DEFAULT_LOCALE,
        enabled_locales: ENABLED_LOCALES,
        default_country: null,
      },
    });
    patched += 1;
    logger.info(
      `backfill-tenant-locale-settings: tenant ${tenant.id} (${tenant.handle}) — set to ru/en default`,
    );
  }

  logger.info(
    `backfill-tenant-locale-settings: ${tenants.length} tenants, ${patched} ${dryRun ? "would be patched" : "patched"}, ${skipped} left alone (already have their own locale settings).`,
  );
}
