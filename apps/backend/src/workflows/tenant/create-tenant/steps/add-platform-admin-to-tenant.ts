import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { TENANT_MODULE } from "../../../../modules/tenant";
import TenantModuleService from "../../../../modules/tenant/service";

export type AddPlatformAdminToTenantStepInput = { tenant_id: string };

/**
 * Gives `PLATFORM_ADMIN_EMAIL` a `tenant_admin` row in every new shop
 * (o25-platform-admin-all-shops), so `app@root.dev` opens every tenant's
 * owner panel without a password of its own per shop. Row only: the
 * emailpass auth identity is shared across every tenant and is never
 * touched here (`scripts/fixtures/o25-platform-admin-all-shops.ts` is what
 * registers it, once, the first time this feature is turned on).
 *
 * Silent no-op when `PLATFORM_ADMIN_EMAIL` is unset (feature off) or the row
 * already exists (idempotent re-run, and defence against the rare race with
 * the backfill fixture running at the same time).
 */
const addPlatformAdminToTenantStep = createStep(
  "add-platform-admin-to-tenant",
  async (input: AddPlatformAdminToTenantStepInput, { container }) => {
    const email = process.env.PLATFORM_ADMIN_EMAIL?.trim();

    if (!email) {
      return new StepResponse(null, null);
    }

    const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

    const [existing] = await tenantModuleService.listTenantAdmins({
      email,
      tenant_id: input.tenant_id,
    });

    if (existing) {
      return new StepResponse({ id: existing.id, created: false }, null);
    }

    const admin = await tenantModuleService.createTenantAdmins({
      email,
      tenant_id: input.tenant_id,
    });

    return new StepResponse({ id: admin.id, created: true }, admin.id);
  },
  async (tenantAdminId, { container }) => {
    if (!tenantAdminId) {
      return;
    }

    const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

    await tenantModuleService.deleteTenantAdmins(tenantAdminId);
  },
);

export default addPlatformAdminToTenantStep;
