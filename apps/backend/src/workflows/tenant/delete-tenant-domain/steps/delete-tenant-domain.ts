import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";

export type DeleteTenantDomainStepInput = {
  /** Ownership is checked by the route before this runs. */
  id: string;
};

/**
 * Removes one `tenant_domain` row (`DELETE /tenants/domains/:id`, tenant-panel
 * wave 2, piece 9).
 *
 * A SOFT delete, so the compensation restores the same row with the same id.
 * The host stays free for someone else while the row is soft-deleted: the
 * unique index is partial (`… ON "tenant_domain" ("host") WHERE deleted_at IS
 * NULL`, Migration20260911004426), which is also why a hard delete plus a
 * re-create would hand the tenant a different id on a rollback.
 */
const deleteTenantDomainStep = createStep(
  "delete-tenant-domain",
  async (input: DeleteTenantDomainStepInput, { container }) => {
    const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

    await tenantModuleService.softDeleteTenantDomains([input.id]);

    return new StepResponse({ id: input.id }, input.id);
  },
  async (deletedId, { container }) => {
    if (!deletedId) {
      return;
    }

    const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);
    await tenantModuleService.restoreTenantDomains([deletedId]);
  },
);

export default deleteTenantDomainStep;
