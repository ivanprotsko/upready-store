import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import {
  createShippingOptionsWorkflow,
  createStockLocationsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows";
import createTenantFulfillmentSetStep from "./steps/create-tenant-fulfillment-set";
import resolveDefaultShippingProfileStep from "./steps/resolve-default-shipping-profile";
import { defaultMethodNames, storeDefaultLocale } from "../../../shipping-tariffs/default-method-names";
import { TENANT_METHOD_SCHEMA, type TenantMethodData } from "../../../shipping-tariffs/tariff";

export type ProvisionTenantWarehouseWorkflowInput = {
  sales_channel_id: string;
  /** Names the warehouse and its service zone; the options get human names from `default-method-names.ts`. */
  tenant_name: string;
  /** Physical city of the warehouse; two tenants may share one. */
  city?: string | null;
  /** ISO-2 country of the warehouse address. */
  country_code?: string;
  /** Locale the two default method names are written in; the store default when omitted. */
  locale?: string | null;
};

/** The one fulfillment provider this starter ships with (`manual_manual`). */
const DEFAULT_PROVIDER_ID = "manual_manual";
/** Placeholder flat tariffs; the tenant edits these on /shipping in the panel. */
const DEFAULT_PICKUP_AMOUNT = 0;
const DEFAULT_COURIER_AMOUNT = 10;
/** Fallback weight (grams) for a cart line whose variant has none, until the tenant sets its own. */
const DEFAULT_ITEM_WEIGHT_G = 500;

/**
 * Gives one tenant its own warehouse so its storefront can check out from the
 * first minute, without sharing stock or shipping with any other tenant.
 *
 * Replaces the slice's first cut, which linked a new tenant's sales channel to
 * every one of the backend's 241 seeded stock locations: cheap to write, but it
 * put every tenant on shared inventory and shared shipping options. Here each
 * tenant gets exactly one stock location, one base service zone covering every
 * country the store has a region for, and two flat shipping options (pickup +
 * courier, provider `manual_manual`) named in the store's default locale
 * («Самовывоз» / «Курьером» for ru). The tenant renames and reprices them on
 * /shipping in the panel.
 *
 * Isolation is the sales-channel <-> stock-location link: a cart in a tenant's
 * channel resolves shipping options through that tenant's warehouse alone. Two
 * tenants with a warehouse in the same city, or the same base countries, never
 * cross — measured, not asserted (see the reprovision script and the seam test).
 *
 * Reused by `createTenantWorkflow` (as a step) and by the reprovision script
 * that moves the stand's existing tenants off the shared locations.
 */
const provisionTenantWarehouseWorkflow = createWorkflow(
  "provision-tenant-warehouse",
  (input: ProvisionTenantWarehouseWorkflowInput) => {
    // The base zone and the option prices follow what the store actually
    // sells: every country its regions cover, priced in every currency those
    // regions use. A cart in any seeded region then finds a shipping option.
    const { data: regions } = useQueryGraphStep({
      entity: "region",
      fields: ["currency_code", "countries.iso_2"],
    });

    const shippingProfileId = resolveDefaultShippingProfileStep();

    const geography = transform({ regions }, ({ regions }) => {
      const countries = new Set<string>();
      const currencies = new Set<string>();
      for (const region of regions) {
        if (region.currency_code) {
          currencies.add(region.currency_code);
        }
        for (const country of region.countries ?? []) {
          if (country?.iso_2) {
            countries.add(country.iso_2);
          }
        }
      }
      return {
        country_codes: Array.from(countries),
        currency_codes: Array.from(currencies),
      };
    });

    const locationsInput = transform({ input }, ({ input }) => ({
      locations: [
        {
          name: `${input.tenant_name} warehouse`,
          address: {
            address_1: `${input.tenant_name} warehouse`,
            city: input.city ?? undefined,
            country_code: (input.country_code ?? "us").toLowerCase(),
          },
        },
      ],
    }));

    const stockLocations = createStockLocationsWorkflow.runAsStep({
      input: locationsInput,
    });

    const fulfillmentSetInput = transform(
      { stockLocations, geography, input },
      ({ stockLocations, geography, input }) => ({
        location_id: stockLocations[0].id,
        name: `${input.tenant_name} warehouse`,
        country_codes: geography.country_codes,
        provider_id: DEFAULT_PROVIDER_ID,
      }),
    );

    const fulfillmentSet = createTenantFulfillmentSetStep(fulfillmentSetInput);

    const linkChannelInput = transform(
      { stockLocations, input },
      ({ stockLocations, input }) => ({
        id: stockLocations[0].id,
        add: [input.sales_channel_id],
      }),
    );

    linkSalesChannelsToStockLocationWorkflow.runAsStep({
      input: linkChannelInput,
    });

    const shippingOptionsInput = transform(
      { fulfillmentSet, shippingProfileId, geography, input },
      ({ fulfillmentSet, shippingProfileId, geography, input }) => {
        const rules = [
          { attribute: "enabled_in_store", value: "true", operator: "eq" as const },
          { attribute: "is_return", value: "false", operator: "eq" as const },
        ];
        const names = defaultMethodNames(input.locale ?? storeDefaultLocale());
        // The same `data` shape the panel writes for a method the owner
        // creates (`src/api/tenants/shipping-methods`), so the two defaults
        // show up on /shipping as editable flat methods in the base zone.
        const methodData = (sortOrder: number, description: string, amount: number): TenantMethodData => ({
          schema: TENANT_METHOD_SCHEMA,
          tariff: { kind: "flat", amount },
          description,
          delivery_hint: null,
          sort_order: sortOrder,
          default_weight_g: DEFAULT_ITEM_WEIGHT_G,
          own_zone: false,
          zone: null,
        });
        const option = (
          code: string,
          name: string,
          description: string,
          amount: number,
          sortOrder: number,
        ) => ({
          name,
          price_type: "flat" as const,
          provider_id: DEFAULT_PROVIDER_ID,
          service_zone_id: fulfillmentSet.service_zone_id,
          shipping_profile_id: shippingProfileId,
          type: { label: name, description, code },
          data: methodData(sortOrder, description, amount),
          prices: geography.currency_codes.map((currency_code) => ({
            currency_code,
            amount,
          })),
          rules,
        });
        return [
          option("pickup", names.pickup.name, names.pickup.description, DEFAULT_PICKUP_AMOUNT, 0),
          option("courier", names.courier.name, names.courier.description, DEFAULT_COURIER_AMOUNT, 1),
        ];
      },
    );

    const shippingOptions = createShippingOptionsWorkflow.runAsStep({
      input: shippingOptionsInput,
    });

    const result = transform(
      { stockLocations, fulfillmentSet, shippingOptions },
      ({ stockLocations, fulfillmentSet, shippingOptions }) => ({
        stock_location_id: stockLocations[0].id,
        fulfillment_set_id: fulfillmentSet.fulfillment_set_id,
        service_zone_id: fulfillmentSet.service_zone_id,
        shipping_option_ids: shippingOptions.map((option) => option.id),
      }),
    );

    return new WorkflowResponse(result);
  },
);

export default provisionTenantWarehouseWorkflow;
