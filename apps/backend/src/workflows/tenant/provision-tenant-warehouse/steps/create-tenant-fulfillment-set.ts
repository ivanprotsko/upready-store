import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import type { IFulfillmentModuleService } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

export type CreateTenantFulfillmentSetStepInput = {
  location_id: string;
  name: string;
  /** Countries the tenant can ship to; the base service zone covers all of them. */
  country_codes: string[];
  /** Fulfillment provider available at the location. `manual_manual` in this starter. */
  provider_id: string;
};

export type CreateTenantFulfillmentSetStepOutput = {
  fulfillment_set_id: string;
  service_zone_id: string;
};

type Compensation = {
  fulfillment_set_id: string;
  location_id: string;
  provider_id: string;
};

/**
 * Gives one tenant warehouse the fulfillment plumbing a cart needs to see
 * shipping options: the location is linked to a fulfillment provider, then a
 * shipping-type fulfillment set with one base service zone (every country the
 * store has a region for) is created and linked to the location.
 *
 * A location links to exactly one fulfillment set (Medusa's stock-location ↔
 * fulfillment link is 1:1; a second link throws "Cannot create multiple links
 * between 'stock_location' and 'fulfillment'"), so one warehouse = one set =
 * one base zone here. `createShippingOptionsWorkflow` then hangs the tenant's
 * two options on the returned `service_zone_id`.
 *
 * Isolation between tenants comes from the sales-channel ↔ stock-location link,
 * not from the zone: two tenants may both cover the same country (or name their
 * warehouse after the same city) and still never share an option, because a
 * cart resolves options through its own channel → its own warehouse only.
 */
const createTenantFulfillmentSetStep = createStep(
  "create-tenant-fulfillment-set",
  async (
    { location_id, name, country_codes, provider_id }: CreateTenantFulfillmentSetStepInput,
    { container },
  ) => {
    const fulfillment: IFulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
    const link = container.resolve(ContainerRegistrationKeys.LINK);

    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: location_id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: provider_id },
    });

    const fulfillmentSet = await fulfillment.createFulfillmentSets({
      name,
      type: "shipping",
      service_zones: [
        {
          name,
          geo_zones: country_codes.map((country_code) => ({
            country_code,
            type: "country" as const,
          })),
        },
      ],
    });

    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: location_id },
      [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
    });

    return new StepResponse<CreateTenantFulfillmentSetStepOutput, Compensation>(
      {
        fulfillment_set_id: fulfillmentSet.id,
        service_zone_id: fulfillmentSet.service_zones[0].id,
      },
      { fulfillment_set_id: fulfillmentSet.id, location_id, provider_id },
    );
  },
  async (comp, { container }) => {
    if (!comp) {
      return;
    }

    const fulfillment: IFulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
    const link = container.resolve(ContainerRegistrationKeys.LINK);

    await link.dismiss({
      [Modules.STOCK_LOCATION]: { stock_location_id: comp.location_id },
      [Modules.FULFILLMENT]: { fulfillment_set_id: comp.fulfillment_set_id },
    });
    await link.dismiss({
      [Modules.STOCK_LOCATION]: { stock_location_id: comp.location_id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: comp.provider_id },
    });
    await fulfillment.deleteFulfillmentSets(comp.fulfillment_set_id);
  },
);

export default createTenantFulfillmentSetStep;
