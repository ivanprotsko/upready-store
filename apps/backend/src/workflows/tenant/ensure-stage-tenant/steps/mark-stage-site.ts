import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import { STAGE_HOST_KEY, STAGE_OF_KEY, STAGE_TENANT_KEY } from "../../../../agent-changesets/stage";

export type MarkStageSiteInput = { main_tenant_id: string; stage_tenant_id: string; stage_host: string };

type Compensation = {
  main: { id: string; metadata: Record<string, unknown> | null };
  stage: { id: string; metadata: Record<string, unknown> | null };
};

/**
 * Ties the two sites together: `stage_tenant_id` on the main site,
 * `stage_of` and `stage_host` on the stage site. The compensation puts both
 * metadata objects back as they were.
 */
const markStageSiteStep = createStep(
  "mark-stage-site",
  async (input: MarkStageSiteInput, { container }) => {
    const service: TenantModuleService = container.resolve(TENANT_MODULE);
    const [main, stage] = await Promise.all([
      service.retrieveTenant(input.main_tenant_id),
      service.retrieveTenant(input.stage_tenant_id),
    ]);

    const mainMetadata = (main.metadata ?? {}) as Record<string, unknown>;
    const stageMetadata = (stage.metadata ?? {}) as Record<string, unknown>;

    await service.updateTenants([
      { id: main.id, metadata: { ...mainMetadata, [STAGE_TENANT_KEY]: stage.id } },
      {
        id: stage.id,
        metadata: { ...stageMetadata, [STAGE_OF_KEY]: main.id, [STAGE_HOST_KEY]: input.stage_host },
      },
    ]);

    return new StepResponse(
      { stage_tenant_id: stage.id },
      {
        main: { id: main.id, metadata: (main.metadata ?? null) as Record<string, unknown> | null },
        stage: { id: stage.id, metadata: (stage.metadata ?? null) as Record<string, unknown> | null },
      } satisfies Compensation,
    );
  },
  async (compensation: Compensation | undefined, { container }) => {
    if (!compensation) return;
    const service: TenantModuleService = container.resolve(TENANT_MODULE);
    await service.updateTenants([
      { id: compensation.main.id, metadata: compensation.main.metadata },
      { id: compensation.stage.id, metadata: compensation.stage.metadata },
    ]);
  },
);

export default markStageSiteStep;
