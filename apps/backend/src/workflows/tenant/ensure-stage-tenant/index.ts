import { createWorkflow, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import cloneTenantWorkflow from "../clone-tenant";
import attachStageHostStep from "./steps/attach-stage-host";
import markStageSiteStep from "./steps/mark-stage-site";
import readStageStateStep from "./steps/read-stage-state";

export type EnsureStageTenantWorkflowInput = { tenant_id: string };

/**
 * The stage site of a shop, made once and found after (t-2026-10-27-04).
 *
 * 1. `read-stage-state` finds the main site, its owner, its primary host and
 *    the stage site it already names, if any.
 * 2. With none, `cloneTenantWorkflow` copies the main site into its group as
 *    `<handle>-stage`, pages included. The clone takes no secrets, domains,
 *    orders or redirects, so the stage site cannot charge a card, ship a
 *    parcel or answer on the live address.
 * 3. `mark-stage-site` ties the two sites together in their metadata.
 * 4. `attach-stage-host` gives the stage site `STAGE_HOST_PREFIX` + the main
 *    site's primary host (`stage.` by default) as its domain. DNS for that
 *    host is Ivan's call; until it resolves, the site is reachable only by
 *    the handle address.
 *
 * Run again, it changes nothing but a missing link or host.
 */
const ensureStageTenantWorkflow = createWorkflow(
  "ensure-stage-tenant",
  (input: EnsureStageTenantWorkflowInput) => {
    const state = readStageStateStep({ tenant_id: input.tenant_id });

    const cloned = when("clone-stage-site", state, (state) => !state.stage_tenant_id).then(() => {
      const cloneInput = transform({ state }, ({ state }) => ({
        source_tenant_id: state.main.id,
        name: `${state.main.name} · stage`,
        handle: state.stage_handle,
        admin: state.owner,
        copy_pages: true,
        copy_shipping: false,
      }));
      return cloneTenantWorkflow.runAsStep({ input: cloneInput });
    });

    const stageId = transform({ state, cloned }, ({ state, cloned }) =>
      (state.stage_tenant_id ?? (cloned?.tenant.id as string)) as string,
    );

    const markInput = transform({ state, stageId }, ({ state, stageId }) => ({
      main_tenant_id: state.main.id,
      stage_tenant_id: stageId,
      stage_host: state.stage_host,
    }));
    markStageSiteStep(markInput);

    const hostInput = transform({ state, stageId }, ({ state, stageId }) => ({
      stage_tenant_id: stageId,
      host: state.stage_host,
    }));
    attachStageHostStep(hostInput);

    return new WorkflowResponse(
      transform({ state, stageId }, ({ state, stageId }) => ({
        main_tenant_id: state.main.id,
        stage_tenant_id: stageId,
        stage_host: state.stage_host,
        created: !state.stage_tenant_id,
      })),
    );
  },
);

export default ensureStageTenantWorkflow;
