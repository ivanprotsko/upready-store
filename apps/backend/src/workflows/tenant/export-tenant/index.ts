import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import resolveTenantIdStep from "./steps/resolve-tenant-id";
import buildTenantBundleStep from "./steps/build-tenant-bundle";

export type ExportTenantWorkflowInput = {
  tenant_id?: string;
  handle?: string;
};

/**
 * Builds the full `upready.tenant-bundle/v1` export for one tenant: every
 * product, order, customer, warehouse setting and file the tenant owns, as
 * one JSON-serialisable document plus a `manifest` of counts and byte size.
 *
 * The one artifact behind two later specs (detaching a tenant into a
 * standalone Medusa, and per-tenant backup), so the format is documented in
 * full at `docs/multitenancy/tenant-bundle-format.md` and validated against
 * `bundle.schema.json` in the seam test.
 *
 * Read-only end to end: no step here writes to a module service, so there is
 * no compensation to define. Used by `POST /admin/tenants/:id/export`
 * (`src/api/admin/tenants/[id]/export/route.ts`) and by the `medusa exec`
 * script `src/scripts/tenant-export.ts` (container access, no HTTP round trip).
 */
const exportTenantWorkflow = createWorkflow(
  "export-tenant",
  (input: ExportTenantWorkflowInput) => {
    const tenantId = resolveTenantIdStep(input);
    const result = buildTenantBundleStep({ tenant_id: tenantId });

    return new WorkflowResponse(result);
  },
);

export default exportTenantWorkflow;
