import type { MedusaContainer } from "@medusajs/framework";
import type { IAuthModuleService, Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../src/modules/tenant";
import type TenantModuleService from "../../src/modules/tenant/service";
import createTenantWorkflow from "../../src/workflows/tenant/create-tenant";

/**
 * w01-wb-readonly-client: the shop the Wildberries import runs against on a
 * local stand. Throwaway, not wired into any pnpm script, and never to be run
 * against a real database:
 *
 *   npx medusa exec ./scripts/fixtures/w01-seed-tenant.ts
 *
 * Same shape as `t17-seed-test-tenant.ts`. Idempotent: a second run finds the
 * shop and creates nothing.
 *
 * The handle is `cherkashino` because that is the tenant the client's store
 * was migrated into on 2026-09-12 (branch `feat/cherkashina-tenant`), so a
 * command written here reads the same on any stand.
 */
const PROVIDER = "emailpass";
const HANDLE = "cherkashino";
const EMAIL = "owner@cherkashino.example";
const PASSWORD = "supersecret";

export default async function seedW01Tenant({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const authModuleService: IAuthModuleService = container.resolve(Modules.AUTH);
  const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

  const [existing] = await tenantModuleService.listTenants({ handle: HANDLE });
  if (existing) {
    logger.info(`w01-seed: ${HANDLE} already exists (${existing.id})`);
    return;
  }

  const registered = await authModuleService.register(PROVIDER, {
    body: { email: EMAIL, password: PASSWORD },
  });

  if (!registered.success || !registered.authIdentity) {
    throw new Error(`w01-seed: could not register ${EMAIL}: ${registered.error}`);
  }

  const { result } = await createTenantWorkflow(container).run({
    input: {
      name: "Черкашино",
      handle: HANDLE,
      admin: { email: EMAIL, first_name: "Оксана", last_name: "Черкашина" },
      authIdentityId: registered.authIdentity.id,
    },
  });

  logger.info(
    `w01-seed: created ${HANDLE} (${result.tenant.id}), owner ${EMAIL} / ${PASSWORD}, ` +
      `publishable key ${result.tenant.api_key.token}`,
  );
}
