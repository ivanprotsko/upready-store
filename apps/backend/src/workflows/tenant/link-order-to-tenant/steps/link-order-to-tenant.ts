import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import type { LinkDefinition } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import tenantOrderLink from "../../../../links/tenant-order";
import tenantSalesChannelLink from "../../../../links/tenant-sales-channel";
import { TENANT_MODULE } from "../../../../modules/tenant";

export type LinkOrderToTenantStepInput = {
  order_id: string;
  sales_channel_id: string | null | undefined;
};

export type LinkOrderToTenantStepOutput = {
  /** The owner found through the order's sales channel, or null when the channel is nobody's. */
  tenant_id: string | null;
  /** False when the order was already linked, or when there was no tenant to link to. */
  linked: boolean;
};

/**
 * The tenant that owns the order's sales channel gets the tenant-order link.
 * The owner is read off the tenant-sales-channel link (channel → tenant).
 * An order placed in a sales channel no tenant owns (the seed profile's own
 * channel, staff orders) is left alone: it is nobody's in `/tenants/*`, and it
 * stays visible in the native Admin as before. Re-running on an order already
 * linked is a no-op, so the subscriber can be retried.
 */
const linkOrderToTenantStep = createStep(
  "link-order-to-tenant",
  async ({ order_id, sales_channel_id }: LinkOrderToTenantStepInput, { container }) => {
    if (!sales_channel_id) {
      return new StepResponse<LinkOrderToTenantStepOutput, LinkDefinition | null>(
        { tenant_id: null, linked: false },
        null,
      );
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const { data: owners } = await query.graph({
      entity: tenantSalesChannelLink.entryPoint,
      fields: ["tenant_id"],
      filters: { sales_channel_id },
    });
    const tenantId = owners[0]?.tenant_id as string | undefined;

    if (!tenantId) {
      return new StepResponse<LinkOrderToTenantStepOutput, LinkDefinition | null>(
        { tenant_id: null, linked: false },
        null,
      );
    }

    const { data: existingLinks } = await query.graph({
      entity: tenantOrderLink.entryPoint,
      fields: ["tenant_id"],
      filters: { order_id },
    });

    if (existingLinks.length > 0) {
      return new StepResponse<LinkOrderToTenantStepOutput, LinkDefinition | null>(
        { tenant_id: existingLinks[0].tenant_id, linked: false },
        null,
      );
    }

    const linkDefinition: LinkDefinition = {
      [TENANT_MODULE]: { tenant_id: tenantId },
      [Modules.ORDER]: { order_id },
    };

    const link = container.resolve(ContainerRegistrationKeys.LINK);
    await link.create(linkDefinition);

    return new StepResponse<LinkOrderToTenantStepOutput, LinkDefinition | null>(
      { tenant_id: tenantId, linked: true },
      linkDefinition,
    );
  },
  async (linkDefinition, { container }) => {
    if (!linkDefinition) {
      return;
    }

    const link = container.resolve(ContainerRegistrationKeys.LINK);
    await link.dismiss(linkDefinition);
  },
);

export default linkOrderToTenantStep;
