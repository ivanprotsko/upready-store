import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";

export type ArchiveTenantStepInput = { id: string };

/**
 * Step 1 of `deleteTenantWorkflow` (contract §4): stamps
 * `metadata.archived_at`. No new column, no migration (the migration
 * snapshot is shared with `feat/mt-panel-2` tonight) — the flag lives in the
 * tenant's own `metadata` JSON, the same place `GET /admin/tenants` derives
 * it back from. Compensation restores the exact previous `metadata` object.
 *
 * The route calling this workflow has already checked the tenant is not
 * archived yet (idempotency lives there, not here), so this step assumes
 * `metadata.archived_at` is currently absent.
 */
const archiveTenantStep = createStep(
  "archive-tenant",
  async (input: ArchiveTenantStepInput, { container }) => {
    const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

    const tenant = await tenantModuleService.retrieveTenant(input.id);
    const previousMetadata = (tenant.metadata as Record<string, unknown> | null) ?? null;
    const archivedAt = new Date().toISOString();

    await tenantModuleService.updateTenants({
      id: input.id,
      metadata: { ...(previousMetadata ?? {}), archived_at: archivedAt },
    });

    return new StepResponse({ archived_at: archivedAt }, { id: input.id, previousMetadata });
  },
  async (compensation, { container }) => {
    if (!compensation) {
      return;
    }

    const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

    await tenantModuleService.updateTenants({
      id: compensation.id,
      metadata: compensation.previousMetadata,
    });
  },
);

export default archiveTenantStep;
