import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";

export type ResolveTenantIdStepInput = {
  tenant_id?: string;
  handle?: string;
};

/**
 * Turns `{ tenant_id }` or `{ handle }` into the tenant's id, so the rest of
 * `exportTenantWorkflow` only ever deals with one identifier. A tenant that
 * does not exist is `NOT_FOUND`, the same predicate the Admin tenants API
 * uses elsewhere (`docs/multitenancy/admin-tenants-api-contract.md` §3):
 * archived tenants are exportable, only a missing one is not.
 */
const resolveTenantIdStep = createStep(
  "resolve-tenant-id",
  async (input: ResolveTenantIdStepInput, { container }) => {
    if (!input.tenant_id && !input.handle) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "exportTenantWorkflow requires tenant_id or handle.",
      );
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY);

    const {
      data: [tenant],
    } = await query.graph({
      entity: "tenant",
      fields: ["id", "handle"],
      filters: input.tenant_id ? { id: input.tenant_id } : { handle: input.handle },
    });

    if (!tenant?.id) {
      const label = input.tenant_id ? `id "${input.tenant_id}"` : `handle "${input.handle}"`;
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Tenant with ${label} was not found.`);
    }

    return new StepResponse(tenant.id as string);
  },
);

export default resolveTenantIdStep;
