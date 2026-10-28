import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import { primaryHostFor } from "../../../../api/storefront/by-host/hosts";
import { isStageSite, stageHostFor, stageTenantIdOf } from "../../../../agent-changesets/stage";

export type ReadStageStateInput = { tenant_id: string };

export type StageState = {
  main: { id: string; name: string; handle: string; primary_host: string };
  /** The stage site already made, if the main site names one that still exists. */
  stage_tenant_id: string | null;
  stage_host: string;
  stage_handle: string;
  /** The login the stage site is made for: the main site's first owner. */
  owner: { email: string; first_name: string | null; last_name: string | null };
};

/**
 * Reads what `ensure-stage-tenant` needs and refuses what it must not do: a
 * stage site of a stage site, or of a shop with no owner to give it to.
 */
const readStageStateStep = createStep(
  "read-stage-state",
  async (input: ReadStageStateInput, { container }) => {
    const service: TenantModuleService = container.resolve(TENANT_MODULE);
    const main = await service.retrieveTenant(input.tenant_id, { relations: ["domains"] });

    if (isStageSite(main.metadata)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, `Tenant ${main.id} is itself a stage site.`);
    }

    const [owner] = await service.listTenantAdmins(
      { tenant_id: main.id, role: "owner" },
      { order: { created_at: "ASC" }, take: 1 },
    );
    if (!owner) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Tenant ${main.id} has no owner to give a stage site to.`);
    }

    const primary = (main.domains ?? []).find((domain) => domain.is_primary);
    const primaryHost = primaryHostFor({ handle: main.handle, primaryDomain: primary?.host ?? null });

    let stageTenantId = stageTenantIdOf(main.metadata);
    if (stageTenantId) {
      const [existing] = await service.listTenants({ id: stageTenantId });
      stageTenantId = existing ? existing.id : null;
    }

    return new StepResponse<StageState>({
      main: { id: main.id, name: main.name, handle: main.handle, primary_host: primaryHost },
      stage_tenant_id: stageTenantId,
      stage_host: stageHostFor(primaryHost),
      stage_handle: `${main.handle}-stage`,
      owner: {
        email: owner.email,
        first_name: owner.first_name ?? null,
        last_name: owner.last_name ?? null,
      },
    });
  },
);

export default readStageStateStep;
