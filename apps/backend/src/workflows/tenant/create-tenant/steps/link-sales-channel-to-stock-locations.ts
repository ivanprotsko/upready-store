import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import type { LinkDefinition } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

export type LinkSalesChannelToStockLocationsStepInput = {
  sales_channel_id: string;
};

/**
 * Attaches the tenant's new sales channel to every stock location the backend
 * already has. Shipping options at checkout are resolved through the cart's
 * sales channel → stock locations → fulfillment sets, so a sales channel with
 * no stock location has no shipping options and no cart can complete. The
 * seed does the same for a second profile (`linkStockLocationsToSalesChannel`
 * in `src/migration-scripts/lib`); stock locations stay shared between
 * tenants in this slice.
 */
const linkSalesChannelToStockLocationsStep = createStep(
  "link-sales-channel-to-stock-locations",
  async ({ sales_channel_id }: LinkSalesChannelToStockLocationsStepInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const link = container.resolve(ContainerRegistrationKeys.LINK);

    const { data: stockLocations } = await query.graph({
      entity: "stock_location",
      fields: ["id"],
    });

    const links: LinkDefinition[] = stockLocations.map((stockLocation) => ({
      [Modules.SALES_CHANNEL]: { sales_channel_id },
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    }));

    if (links.length > 0) {
      await link.create(links);
    }

    return new StepResponse({ stock_location_ids: stockLocations.map((s) => s.id) }, links);
  },
  async (links, { container }) => {
    if (!links?.length) {
      return;
    }

    const link = container.resolve(ContainerRegistrationKeys.LINK);
    await link.dismiss(links);
  },
);

export default linkSalesChannelToStockLocationsStep;
