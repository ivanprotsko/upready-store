import type { MedusaContainer } from "@medusajs/framework";
import type { IAuthModuleService, Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { TENANT_ACTOR_TYPE, TENANT_MODULE } from "../../src/modules/tenant";
import type TenantModuleService from "../../src/modules/tenant/service";

const PROVIDER = "emailpass";

/**
 * o25-platform-admin-all-shops: gives `PLATFORM_ADMIN_EMAIL` a `tenant_admin`
 * row in every EXISTING (non-deleted) tenant, once, on a database that
 * already had shops before the feature landed. New shops get the row
 * automatically from `createTenantWorkflow`
 * (`workflows/tenant/create-tenant/steps/add-platform-admin-to-tenant.ts`);
 * this fixture is the one-time catch-up for everything created before that.
 *
 * Idempotent, safe to run again:
 *   - the emailpass identity is registered only when none exists yet for
 *     this email (an existing password is NEVER reset — `medusa user -e
 *     app@root.dev` may already have created it, the way the stand's lead
 *     did before this fixture existed);
 *   - a `tenant_admin` row is inserted only for a tenant that does not
 *     already have one for this email;
 *   - `app_metadata.tenant_id` (the identity's DEFAULT shop on next login)
 *     is set only when the identity does not already carry one, and the
 *     existing `app_metadata.user_id` (the Medusa admin `user` row this
 *     identity may also carry) is preserved untouched.
 *
 * Reads the password from `PLATFORM_ADMIN_PASSWORD` (env only — never
 * written to a file, a commit, a log line or a screenshot) and uses it ONLY
 * when the identity has to be registered for the first time.
 *
 *   PLATFORM_ADMIN_PASSWORD=<throwaway> npx medusa exec \
 *     ./scripts/fixtures/o25-platform-admin-all-shops.ts
 */
export default async function backfillPlatformAdminAllShops({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const authModuleService: IAuthModuleService = container.resolve(Modules.AUTH);
  const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim();

  if (!email) {
    logger.info("o25-platform-admin-all-shops: PLATFORM_ADMIN_EMAIL is not set — nothing to do.");
    return;
  }

  let [identity] = await authModuleService.listAuthIdentities({
    provider_identities: { entity_id: email, provider: PROVIDER },
  });

  if (!identity) {
    const password = process.env.PLATFORM_ADMIN_PASSWORD;

    if (!password) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `o25-platform-admin-all-shops: no emailpass identity exists yet for ${email}, and ` +
          "PLATFORM_ADMIN_PASSWORD is not set to register one. Set it (a throwaway value is " +
          "fine on a scratch database) and re-run, or create the identity first with " +
          "`npx medusa user -e ...`.",
      );
    }

    const registered = await authModuleService.register(PROVIDER, {
      body: { email, password },
    });

    if (!registered.success || !registered.authIdentity) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `o25-platform-admin-all-shops: could not register ${email}: ${registered.error ?? "no reason given"}.`,
      );
    }

    identity = registered.authIdentity;
    logger.info(`o25-platform-admin-all-shops: registered a new emailpass identity for ${email}.`);
  } else {
    logger.info(`o25-platform-admin-all-shops: ${email} already has an emailpass identity — password left as is.`);
  }

  const tenants = await tenantModuleService.listTenants({});
  let created = 0;
  let skipped = 0;

  for (const tenant of tenants) {
    const [existingRow] = await tenantModuleService.listTenantAdmins({
      email,
      tenant_id: tenant.id,
    });

    if (existingRow) {
      skipped += 1;
      continue;
    }

    await tenantModuleService.createTenantAdmins({
      email,
      role: "developer",
      tenant_id: tenant.id,
    });
    created += 1;
  }

  logger.info(
    `o25-platform-admin-all-shops: ${created} tenant_admin row(s) created, ${skipped} already existed ` +
      `(${tenants.length} tenant(s) total).`,
  );

  const appMetadata = (identity.app_metadata as Record<string, unknown> | null) ?? {};

  if (!appMetadata.tenant_id) {
    const cherkashino = tenants.find((tenant) => tenant.handle === "cherkashino");
    const defaultTenant = cherkashino ?? tenants[0];

    if (defaultTenant) {
      const [defaultRow] = await tenantModuleService.listTenantAdmins({
        email,
        tenant_id: defaultTenant.id,
      });

      if (defaultRow) {
        await authModuleService.updateAuthIdentities({
          id: identity.id,
          app_metadata: { ...appMetadata, [`${TENANT_ACTOR_TYPE}_id`]: defaultRow.id },
        });
        logger.info(
          `o25-platform-admin-all-shops: default shop on login set to "${defaultTenant.handle}" (${defaultTenant.id}).`,
        );
      }
    } else {
      logger.info("o25-platform-admin-all-shops: no tenants exist yet — no default shop to set.");
    }
  } else {
    logger.info("o25-platform-admin-all-shops: identity already has a default shop — left as is.");
  }
}
