import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

export type EnsureLocationProviderLinkInput = {
  location_id: string;
  provider_id: string;
};

/**
 * Links a stock location to a fulfillment provider unless the link already
 * exists. `provisionTenantWarehouseWorkflow` links every warehouse to
 * `manual_manual`; a tenant's first tariff method needs `tariff_tariff` on the
 * same warehouse, and a second method must not fail on a duplicate link.
 * Compensation removes the link only when this run created it.
 */
const ensureLocationProviderLinkStep = createStep(
  "ensure-location-provider-link",
  async ({ location_id, provider_id }: EnsureLocationProviderLinkInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const link = container.resolve(ContainerRegistrationKeys.LINK);

    const { data: existing } = await query.graph({
      entity: "location_fulfillment_provider",
      fields: ["id"],
      filters: { stock_location_id: location_id, fulfillment_provider_id: provider_id },
    });

    if (existing.length > 0) {
      return new StepResponse({ created: false }, null);
    }

    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: location_id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: provider_id },
    });

    return new StepResponse({ created: true }, { location_id, provider_id });
  },
  async (comp, { container }) => {
    if (!comp) {
      return;
    }
    const link = container.resolve(ContainerRegistrationKeys.LINK);
    await link.dismiss({
      [Modules.STOCK_LOCATION]: { stock_location_id: comp.location_id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: comp.provider_id },
    });
  },
);

export default ensureLocationProviderLinkStep;
