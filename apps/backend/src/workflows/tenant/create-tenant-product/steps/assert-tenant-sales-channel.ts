import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { MedusaError } from "@medusajs/framework/utils";

export type AssertTenantSalesChannelStepInput = {
  tenant_id: string;
  sales_channel_id?: string | null;
};

/**
 * The tenant's sales channel is a module link, and a link can be gone (the
 * channel deleted through the Admin, `removeRemoteLinkStep`). A product cannot
 * be published into nothing, so the workflow stops here with a 400 rather than
 * creating a product no storefront can see. A step, not a `transform`, because
 * a throw inside `transform` never surfaces as a workflow failure.
 */
const assertTenantSalesChannelStep = createStep(
  "assert-tenant-sales-channel",
  async ({ tenant_id, sales_channel_id }: AssertTenantSalesChannelStepInput) => {
    if (!sales_channel_id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Tenant ${tenant_id} has no sales channel to sell in.`,
      );
    }

    return new StepResponse(sales_channel_id);
  },
);

export default assertTenantSalesChannelStep;
