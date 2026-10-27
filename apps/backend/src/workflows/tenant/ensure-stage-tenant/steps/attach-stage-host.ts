import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";

export type AttachStageHostInput = { stage_tenant_id: string; host: string };

/**
 * Gives the stage site its address as its primary domain. Running again is a
 * no-op when the row is already there; a host another site holds is refused.
 * The compensation deletes only a row this step created.
 */
const attachStageHostStep = createStep(
  "attach-stage-host",
  async (input: AttachStageHostInput, { container }) => {
    const service: TenantModuleService = container.resolve(TENANT_MODULE);
    const [existing] = await service.listTenantDomains({ host: input.host }, { relations: ["tenant"] });

    if (existing) {
      const ownerId = (existing as { tenant?: { id?: string } | null }).tenant?.id;
      if (ownerId !== input.stage_tenant_id) {
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          `Host ${input.host} already belongs to another site.`,
        );
      }
      return new StepResponse({ host: input.host, created: false }, null);
    }

    const created = await service.createTenantDomains({
      host: input.host,
      is_primary: true,
      tenant_id: input.stage_tenant_id,
    } as never);

    return new StepResponse({ host: input.host, created: true }, (created as { id: string }).id);
  },
  async (createdId: string | null | undefined, { container }) => {
    if (!createdId) return;
    const service: TenantModuleService = container.resolve(TENANT_MODULE);
    await service.deleteTenantDomains([createdId]);
  },
);

export default attachStageHostStep;
