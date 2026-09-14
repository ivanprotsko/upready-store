import { createWorkflow, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { createServiceZonesWorkflow, createShippingOptionsWorkflow } from "@medusajs/medusa/core-flows";
import type { TenantMethodData } from "../../../shipping-tariffs/tariff";
import ensureLocationProviderLinkStep from "./steps/ensure-location-provider-link";
import { geoZonesOf } from "./geo-zones";

export type CreateTenantShippingMethodInput = {
  name: string;
  data: TenantMethodData;
  enabled: boolean;
  provider_id: string;
  shipping_profile_id: string;
  fulfillment_set_id: string;
  base_service_zone_id: string;
  stock_location_id: string;
  /** Currencies a flat price is written in; ignored for a calculated tariff. */
  currency_codes: string[];
};

export const shippingOptionRules = (enabled: boolean) => [
  { attribute: "enabled_in_store", value: enabled ? "true" : "false", operator: "eq" as const },
  { attribute: "is_return", value: "false", operator: "eq" as const },
];

/** The Medusa price type a tariff needs: only a plain flat tariff is priced by a price row; the rest ask the provider. */
export const priceTypeOf = (data: TenantMethodData): "flat" | "calculated" =>
  data.tariff.kind === "flat" ? "flat" : "calculated";

/**
 * One delivery method a shop owner creates on /shipping: a service zone of its
 * own when the method is restricted to a country or regions (else the
 * warehouse's base zone), the tariff provider linked to the warehouse, and the
 * shipping option carrying the tariff in `data`. Every piece is a step, so a
 * failure rolls back the zone and the link with it.
 */
const createTenantShippingMethodWorkflow = createWorkflow(
  "create-tenant-shipping-method",
  (input: CreateTenantShippingMethodInput) => {
    const ownZone = when("create-own-zone", input, (input) => input.data.zone !== null).then(() => {
      const zoneInput = transform({ input }, ({ input }) => ({
        data: [
          {
            name: input.name,
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

    const optionInput = transform({ input, ownZone }, ({ input, ownZone }) => {
      const service_zone_id = ownZone?.[0]?.id ?? input.base_service_zone_id;
      const data: TenantMethodData = { ...input.data, own_zone: Boolean(ownZone?.[0]?.id) };
      const base = {
        name: input.name,
        provider_id: input.provider_id,
        service_zone_id,
        shipping_profile_id: input.shipping_profile_id,
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

    const options = createShippingOptionsWorkflow.runAsStep({ input: optionInput });

    return new WorkflowResponse(transform({ options }, ({ options }) => ({ id: options[0].id })));
  },
);

export default createTenantShippingMethodWorkflow;
