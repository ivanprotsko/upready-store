import type { MedusaContainer } from "@medusajs/framework";
import type { IAuthModuleService, Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../modules/tenant";
import TenantModuleService from "../modules/tenant/service";
import createTenantWorkflow from "../workflows/tenant/create-tenant";

/**
 * Seeds two demo tenants on a backend that already carries the store, regions,
 * stock locations and fulfillment (run `pnpm backend:seed` first). Run with:
 *
 *   npx medusa exec ./src/scripts/seed-tenants.ts
 *
 * Idempotent by handle: a tenant that exists is skipped. Each tenant gets an
 * emailpass login for its admin, a sales channel, a publishable key and the
 * stock-location links, all through `createTenantWorkflow`, the same path
 * `POST /tenants` takes. The publishable key token is printed once, here: it
 * is a public storefront key, not a secret, and the API Key Module returns the
 * raw value only at creation.
 *
 * The admin password comes from TENANT_SEED_PASSWORD and defaults to
 * `supersecret`, the same deliberate demo default the rest of this starter uses.
 */
const SEED_TENANTS = [
  {
    name: "Acme",
    handle: "acme",
    admin: { email: "admin@acme.test", first_name: "Ada", last_name: "Acme" },
  },
  {
    name: "Globex",
    handle: "globex",
    admin: { email: "admin@globex.test", first_name: "Gus", last_name: "Globex" },
  },
];

const PROVIDER = "emailpass";

export default async function seedTenants({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const authModuleService: IAuthModuleService = container.resolve(Modules.AUTH);
  const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);
  const password = process.env.TENANT_SEED_PASSWORD || "supersecret";

  for (const seed of SEED_TENANTS) {
    const [existing] = await tenantModuleService.listTenants({ handle: seed.handle });
    if (existing) {
      logger.info(`seed-tenants: ${seed.handle} already exists (${existing.id}) — skipped.`);
      continue;
    }

    const registered = await authModuleService.register(PROVIDER, {
      body: { email: seed.admin.email, password },
    });
    if (!registered.success || !registered.authIdentity) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `seed-tenants: could not register a login for ${seed.admin.email}: ${
          registered.error ?? "no reason given"
        }.`,
      );
    }

    const { result } = await createTenantWorkflow(container).run({
      input: {
        name: seed.name,
        handle: seed.handle,
        admin: seed.admin,
        authIdentityId: registered.authIdentity.id,
      },
    });

    logger.info(
      `seed-tenants: ${seed.handle} → ${result.tenant.id}, admin ${seed.admin.email}, sales channel ${result.tenant.sales_channel_id}, publishable key ${result.publishable_api_key.token}.`,
    );
  }
}
