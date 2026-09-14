import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { TENANT_MODULE } from "../../../../modules/tenant";
import TenantModuleService from "../../../../modules/tenant/service";
import type { TenantHomeDocument } from "../../../../api/tenants/home/validators";

export type UpsertTenantHomeStepInput = {
  tenant_id: string;
  config: TenantHomeDocument;
};

/** What the compensation needs: the row written, and the document it replaced
 *  (`null` when the step created the row, so compensation deletes it instead). */
type UpsertTenantHomeCompensation = {
  id: string;
  previous: Record<string, unknown> | null;
};

/**
 * Writes the tenant's one `tenant_home_config` row: an update when the row
 * exists, a create when it does not. Compensation puts the previous document
 * back, or deletes the row the step created, so a failed run leaves the
 * storefront on exactly the composition it had before.
 */
const upsertTenantHomeStep = createStep(
  "upsert-tenant-home",
  async ({ tenant_id, config }: UpsertTenantHomeStepInput, { container }) => {
    const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

    const [existing] = await tenantModuleService.listTenantHomeConfigs({ tenant_id });

    if (existing) {
      const previous = (existing.config ?? null) as Record<string, unknown> | null;
      const [updated] = await tenantModuleService.updateTenantHomeConfigs([
        { id: existing.id, config },
      ]);

      return new StepResponse<typeof updated, UpsertTenantHomeCompensation>(updated, {
        id: existing.id,
        previous,
      });
    }

    const created = await tenantModuleService.createTenantHomeConfigs({
      tenant_id,
      config,
    });

    return new StepResponse<typeof created, UpsertTenantHomeCompensation>(created, {
      id: created.id,
      previous: null,
    });
  },
  async (compensation: UpsertTenantHomeCompensation | undefined, { container }) => {
    if (!compensation) {
      return;
    }

    const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

    if (compensation.previous === null) {
      await tenantModuleService.deleteTenantHomeConfigs(compensation.id);
      return;
    }

    await tenantModuleService.updateTenantHomeConfigs([
      { id: compensation.id, config: compensation.previous },
    ]);
  },
);

export default upsertTenantHomeStep;
