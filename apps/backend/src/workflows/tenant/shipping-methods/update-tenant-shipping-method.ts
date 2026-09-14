import { createWorkflow, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import {
  createServiceZonesWorkflow,
  deleteServiceZonesWorkflow,
  updateServiceZonesWorkflow,
  updateShippingOptionsWorkflow,
} from "@medusajs/medusa/core-flows";
import type { TenantMethodData } from "../../../shipping-tariffs/tariff";
import ensureLocationProviderLinkStep from "./steps/ensure-location-provider-link";
import { geoZonesOf, zoneNameFor } from "./geo-zones";
import { priceTypeOf, shippingOptionRules } from "./create-tenant-shipping-method";

export type UpdateTenantShippingMethodInput = {
  id: string;
  name: string;
  data: TenantMethodData;
  enabled: boolean;
  /** The zone the option sits in now, and whether that zone belongs to this method alone. */
  current_service_zone_id: string;
  current_own_zone: boolean;
  provider_id: string;
  fulfillment_set_id: string;
  base_service_zone_id: string;
  stock_location_id: string;
  currency_codes: string[];
};

/**
 * Edits one tenant method. The zone follows the edit in three shapes: an own
 * zone is updated in place; a method moving from the base zone to a
 * restricted one gets a new zone; a method moving back to «all countries»
 * returns to the base zone and its own zone is deleted. The provider is
 * switched to the tariff provider (and linked to the warehouse) whenever a
 * provisioned `manual_manual` default gets a weight or threshold tariff.
 */
const updateTenantShippingMethodWorkflow = createWorkflow(
  "update-tenant-shipping-method",
  (input: UpdateTenantShippingMethodInput) => {
    when("update-own-zone", input, (input) => input.current_own_zone && input.data.zone !== null).then(() => {
      const zoneUpdate = transform({ input }, ({ input }) => ({
        selector: { id: input.current_service_zone_id },
        update: { geo_zones: geoZonesOf(input.data.zone!) },
      }));
      return updateServiceZonesWorkflow.runAsStep({ input: zoneUpdate });
    });

    const createdZone = when(
      "create-own-zone",
      input,
      (input) => !input.current_own_zone && input.data.zone !== null,
    ).then(() => {
      const zoneInput = transform({ input }, ({ input }) => ({
        data: [
          {
            name: zoneNameFor(input.name, input.fulfillment_set_id),
            fulfillment_set_id: input.fulfillment_set_id,
            geo_zones: geoZonesOf(input.data.zone!),
          },
        ],
      }));
      return createServiceZonesWorkflow.runAsStep({ input: zoneInput });
    });

    const linkInput = transform({ input }, ({ input }) => ({
      location_id: input.stock_location_id,
      provider_id: input.provider_id,
    }));
    ensureLocationProviderLinkStep(linkInput);

    const optionUpdate = transform({ input, createdZone }, ({ input, createdZone }) => {
      const movesToBase = input.current_own_zone && input.data.zone === null;
      const service_zone_id = createdZone?.[0]?.id ?? (movesToBase ? input.base_service_zone_id : undefined);
      const own_zone = Boolean(createdZone?.[0]?.id) || (input.current_own_zone && !movesToBase);
      const data: TenantMethodData = { ...input.data, own_zone };
      const base = {
        id: input.id,
        name: input.name,
        provider_id: input.provider_id,
        ...(service_zone_id ? { service_zone_id } : {}),
        type: { label: input.name, description: input.data.description ?? undefined, code: "tenant-method" },
        data,
        rules: shippingOptionRules(input.enabled),
      };
      if (priceTypeOf(data) === "flat" && data.tariff.kind === "flat") {
        const amount = data.tariff.amount;
        return [
          {
            ...base,
            price_type: "flat" as const,
            prices: input.currency_codes.map((currency_code) => ({ currency_code, amount })),
          },
        ];
      }
      return [{ ...base, price_type: "calculated" as const }];
    });

    const updated = updateShippingOptionsWorkflow.runAsStep({ input: optionUpdate });

    when("drop-own-zone", input, (input) => input.current_own_zone && input.data.zone === null).then(() => {
      const ids = transform({ input }, ({ input }) => ({ ids: [input.current_service_zone_id] }));
      return deleteServiceZonesWorkflow.runAsStep({ input: ids });
    });

    return new WorkflowResponse(transform({ updated }, ({ updated }) => ({ id: updated[0].id })));
  },
);

export default updateTenantShippingMethodWorkflow;
