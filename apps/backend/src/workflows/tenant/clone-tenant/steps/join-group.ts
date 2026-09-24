import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";

export type JoinGroupInput = {
  source_tenant_id: string;
  source_name: string;
  source_group_id: string | null;
  new_tenant_id: string;
};

type Compensation = { new_tenant_id: string; created_group_id: string | null; source_tenant_id: string };

/**
 * Puts the new site into the source's group, creating the group first when
 * the source has none (design §3.1: the group is created implicitly by the
 * first «Создать сайт»). The group takes the source's name; the owner never
 * sees it, the panel says «мои сайты».
 */
const joinGroupStep = createStep(
  "join-group",
  async (input: JoinGroupInput, { container }) => {
    const service: TenantModuleService = container.resolve(TENANT_MODULE);

    let groupId = input.source_group_id;
    let created: string | null = null;

    if (!groupId) {
      const group = await service.createTenantGroups({ name: input.source_name });
      groupId = group.id;
      created = group.id;
      await service.updateTenants({ id: input.source_tenant_id, group_id: groupId });
    }

    await service.updateTenants({ id: input.new_tenant_id, group_id: groupId });

    return new StepResponse(
      { group_id: groupId as string },
      {
        new_tenant_id: input.new_tenant_id,
        created_group_id: created,
        source_tenant_id: input.source_tenant_id,
      } satisfies Compensation,
    );
  },
  async (compensation: Compensation | undefined, { container }) => {
    if (!compensation) {
      return;
    }
    const service: TenantModuleService = container.resolve(TENANT_MODULE);
    await service.updateTenants({ id: compensation.new_tenant_id, group_id: null });
    if (compensation.created_group_id) {
      await service.updateTenants({ id: compensation.source_tenant_id, group_id: null });
      await service.deleteTenantGroups(compensation.created_group_id);
    }
  },
);

export default joinGroupStep;
