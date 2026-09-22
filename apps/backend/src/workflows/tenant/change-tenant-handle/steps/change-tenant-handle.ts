import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";

export type ChangeTenantHandleStepInput = {
  tenant_id: string;
  /** Already shape-checked and proven free by the route (`assertHandleAvailable`). */
  handle: string;
};

/**
 * `changed: false` is the "new address equals the current one" case: nothing was
 * written, so the rollback has nothing to undo. The field exists because a step's
 * compensation input is one type, and `undefined` is not it.
 */
type Compensation = { tenant_id: string; handle: string; changed: boolean };

/**
 * Moves the shop to its new address: the current handle becomes an alias and the
 * new one takes its place (`specs/tenant-address/CANONICAL.md` §1.2).
 *
 * Two things it deliberately does in ONE step. The alias and the handle have to
 * move together — a shop whose handle changed without its old address being kept
 * would answer 404 on every link anyone ever shared. And returning to an address
 * this shop used before DELETES that alias instead of leaving a row that now
 * duplicates the live handle.
 */
const changeTenantHandleStep = createStep(
  "change-tenant-handle",
  async (input: ChangeTenantHandleStepInput, { container }) => {
    const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

    const tenant = await tenantModuleService.retrieveTenant(input.tenant_id);
    const previousHandle = tenant.handle;

    if (previousHandle === input.handle) {
      return new StepResponse(
        { tenant, previousHandle },
        { tenant_id: input.tenant_id, handle: previousHandle, changed: false },
      );
    }

    const [existingAlias] = await tenantModuleService.listTenantHandleAliases({
      handle: previousHandle,
    });

    if (!existingAlias) {
      await tenantModuleService.createTenantHandleAliases({
        handle: previousHandle,
        tenant_id: input.tenant_id,
      });
    }

    const [aliasOfNewHandle] = await tenantModuleService.listTenantHandleAliases({
      handle: input.handle,
    });

    if (aliasOfNewHandle) {
      await tenantModuleService.deleteTenantHandleAliases([aliasOfNewHandle.id]);
    }

    const updated = await tenantModuleService.updateTenants({
      id: input.tenant_id,
      handle: input.handle,
    });

    return new StepResponse({ tenant: updated, previousHandle }, {
      tenant_id: input.tenant_id,
      handle: previousHandle,
      changed: true,
    } satisfies Compensation);
  },
  async (compensation: Compensation | undefined, { container }) => {
    if (!compensation?.changed) {
      return;
    }

    const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

    // Back to the address the shop answered on before, and the alias minted for
    // it a moment ago goes with it: a rollback must not leave the shop holding
    // its own old address twice.
    await tenantModuleService.updateTenants({
      id: compensation.tenant_id,
      handle: compensation.handle,
    });

    const [alias] = await tenantModuleService.listTenantHandleAliases({
      handle: compensation.handle,
    });

    if (alias) {
      await tenantModuleService.deleteTenantHandleAliases([alias.id]);
    }
  },
);

export default changeTenantHandleStep;
