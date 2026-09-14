import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";

export type ResolveTenantLinksStepInput = { id: string };

/**
 * Read-only: the tenant's sales channel and publishable key ids, through the
 * tenant-sales-channel and tenant-api-key links. `deleteTenantWorkflow` needs
 * them to disable the channel and revoke the key without the route having to
 * resolve them first. No compensation; nothing here is written.
 */
const resolveTenantLinksStep = createStep(
  "resolve-tenant-links",
  async (input: ResolveTenantLinksStepInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);

    const {
      data: [tenant],
    } = await query.graph({
      entity: "tenant",
      fields: ["id", "sales_channel.id", "api_key.id"],
      filters: { id: [input.id] },
    });

    return new StepResponse({
      sales_channel_id: (tenant?.sales_channel?.id as string | undefined) ?? null,
      api_key_id: (tenant?.api_key?.id as string | undefined) ?? null,
    });
  },
);

export default resolveTenantLinksStep;
