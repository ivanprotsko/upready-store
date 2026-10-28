import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";
import ensureStageTenantWorkflow from "../workflows/tenant/ensure-stage-tenant";

/**
 * Makes a shop's stage site, or finds the one it has (t-2026-10-27-04,
 * `workflows/tenant/ensure-stage-tenant`). The lead runs it by hand once per
 * shop; a second run changes nothing. The host is `STAGE_HOST_PREFIX` (default
 * `stage.`) + the shop's primary host; DNS for it is set apart.
 *
 *   npx medusa exec ./src/scripts/ensure-stage-site.ts <shop handle>
 */
export default async function ensureStageSite({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const handle = (args ?? [])[0];
  if (!handle) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Usage: ensure-stage-site.ts <shop handle>");
  }

  const service: TenantModuleService = container.resolve(TENANT_MODULE);
  const [tenant] = await service.listTenants({ handle }, { take: 1 });
  if (!tenant) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `No shop with handle ${handle}.`);
  }

  const { result } = await ensureStageTenantWorkflow(container).run({ input: { tenant_id: tenant.id } });
  logger.info(
    `ensure-stage-site: ${handle} → ${result.stage_host} (${result.stage_tenant_id}), ${result.created ? "created" : "already there"}`,
  );
  return result;
}
