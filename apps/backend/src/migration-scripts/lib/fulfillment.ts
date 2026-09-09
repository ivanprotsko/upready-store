import type { MedusaContainer } from "@medusajs/framework";
import { ModuleRegistrationName, Modules } from "@medusajs/framework/utils";
import {
  createShippingOptionsWorkflow,
  createStockLocationsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows";
import {
  SEED_FULFILLMENT_PROVIDER_IDS,
  SEED_SHIPPING_OPTIONS,
} from "../data/fulfillment";
import { SEED_PICKUP_POINTS } from "../data/pickup-points";
import { SEED_REGIONS } from "../data/regions";
import { getStockLocationsByName } from "./stock-locations";
import { getSalesChannel } from "./store";
import { getLink, getQuery } from "./utils";

export const getShippingProfile = async (container: MedusaContainer) => {
  const { data } = await getQuery(container).graph({
    entity: "shipping_profile",
    fields: ["id"],
  });
  return data[0];
};

export const seedFulfillment = async (container: MedusaContainer) => {
  const link = getLink(container);
  const fulfillmentModuleService = container.resolve(
    ModuleRegistrationName.FULFILLMENT,
  );
  const shippingProfile = await getShippingProfile(container);
  const stockLocationsByName = await getStockLocationsByName(container);

  // F6: the active profile's own persona-city pickup points (empty array,
  // hence no `pickupCountryCode`, when no `STORE_PROFILE` is set or the
  // profile ships no `pickup-points.json` — see `data/pickup-points/index.ts`).
  // All four points of a profile share one country (the persona city), so the
  // first is enough to find which of the 241 `SEED_REGIONS` they belong to.
  const pickupCountryCode = SEED_PICKUP_POINTS[0]?.address.country_code;

  for (const seedRegion of SEED_REGIONS) {
    const stockLocation = stockLocationsByName.get(
      seedRegion.stock_location.name,
    );
    if (!stockLocation) {
      throw new Error(
        `Missing stock location "${seedRegion.stock_location.name}" for region "${seedRegion.name}".`,
      );
    }

    for (const providerId of SEED_FULFILLMENT_PROVIDER_IDS) {
      await link.create({
        [Modules.STOCK_LOCATION]: {
          stock_location_id: stockLocation.id,
        },
        [Modules.FULFILLMENT]: {
          fulfillment_provider_id: providerId,
        },
      });
    }

    const fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets(
      {
        name: `${seedRegion.stock_location.name} shipping`,
        type: "shipping",
        service_zones: [
          {
            name: seedRegion.name,
            geo_zones: seedRegion.countries.map((country_code) => ({
              country_code,
              type: "country" as const,
            })),
          },
        ],
      },
    );

    await link.create({
      [Modules.STOCK_LOCATION]: {
        stock_location_id: stockLocation.id,
      },
      [Modules.FULFILLMENT]: {
        fulfillment_set_id: fulfillmentSet.id,
      },
    });

    // The region matching the active profile's pickup points gets its own
    // real "pickup" fulfillment set below (type `"pickup"`, not `"shipping"`)
    // with the one shipping option that makes `isPickupShippingOption()` true
    // (map §2, `2026-09-09-checkout-account-map.md`). Its generic same-named
    // "Pickup" option under this `"shipping"` set would otherwise sit next to
    // it in the checkout `RadioGroup` as a second, non-functional card — drop
    // it here only; every other region keeps its unchanged (non-functional,
    // out of this package's scope) generic pickup option.
    const isPickupRegion =
      !!pickupCountryCode && seedRegion.countries.includes(pickupCountryCode);
    const regionShippingOptions = isPickupRegion
      ? SEED_SHIPPING_OPTIONS.filter((option) => option.code !== "pickup")
      : SEED_SHIPPING_OPTIONS;

    await createShippingOptionsWorkflow(container).run({
      input: regionShippingOptions.map((shippingOption) => ({
        name: shippingOption.name,
        price_type: "flat" as const,
        provider_id: shippingOption.provider_id,
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: shippingOption.label,
          description: shippingOption.description,
          code: shippingOption.code,
        },
        metadata: shippingOption.metadata,
        prices: [
          {
            currency_code: seedRegion.currency_code,
            amount: seedRegion.shipping_prices[shippingOption.code],
          },
        ],
        rules: [
          {
            attribute: "enabled_in_store",
            value: "true",
            operator: "eq" as const,
          },
          {
            attribute: "is_return",
            value: "false",
            operator: "eq" as const,
          },
        ],
      })),
    });
  }

  if (SEED_PICKUP_POINTS.length && pickupCountryCode) {
    const seedRegion = SEED_REGIONS.find((region) =>
      region.countries.includes(pickupCountryCode),
    );
    if (!seedRegion) {
      throw new Error(
        `No seed region covers country "${pickupCountryCode}" for this profile's pickup points ("data/profiles/<id>/pickup-points.json").`,
      );
    }

    const pickupOptionTemplate = SEED_SHIPPING_OPTIONS.find(
      (option) => option.code === "pickup",
    );
    if (!pickupOptionTemplate) {
      throw new Error(
        'SEED_SHIPPING_OPTIONS has no "pickup" entry to base the profile\'s pickup shipping option on.',
      );
    }

    // One stock location per point, address + F6's `opening_hours` on
    // `metadata` (the field the new `/store/pickup-points` route and the
    // storefront's `checkout-pickup-point-sheet` both read).
    const { result: pickupLocations } = await createStockLocationsWorkflow(
      container,
    ).run({
      input: {
        locations: SEED_PICKUP_POINTS.map((point) => ({
          name: point.name,
          address: point.address,
          metadata: { opening_hours: point.opening_hours },
        })),
      },
    });

    const pickupFulfillmentSet =
      await fulfillmentModuleService.createFulfillmentSets({
        name: `${seedRegion.name} pickup points`,
        type: "pickup",
        service_zones: [
          {
            name: `${seedRegion.name} pickup`,
            geo_zones: [
              { country_code: pickupCountryCode, type: "country" as const },
            ],
          },
        ],
      });

    const salesChannel = await getSalesChannel(container);

    for (const location of pickupLocations) {
      for (const providerId of SEED_FULFILLMENT_PROVIDER_IDS) {
        await link.create({
          [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
          [Modules.FULFILLMENT]: { fulfillment_provider_id: providerId },
        });
      }

      await link.create({
        [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
        [Modules.FULFILLMENT]: { fulfillment_set_id: pickupFulfillmentSet.id },
      });

      await linkSalesChannelsToStockLocationWorkflow(container).run({
        input: { id: location.id, add: [salesChannel.id] },
      });
    }

    // A single option — the picker (D2 §1-§5) chooses *which* of the four
    // locations, the shipping-method `RadioGroup` only ever needs to choose
    // "pickup" once (frame 1: `[Courier] [Pickup] [Express]`, three cards).
    await createShippingOptionsWorkflow(container).run({
      input: [pickupOptionTemplate].map((shippingOption) => ({
        name: shippingOption.name,
        price_type: "flat" as const,
        provider_id: shippingOption.provider_id,
        service_zone_id: pickupFulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: shippingOption.label,
          description: shippingOption.description,
          code: shippingOption.code,
        },
        metadata: shippingOption.metadata,
        prices: [
          {
            currency_code: seedRegion.currency_code,
            amount: seedRegion.shipping_prices[shippingOption.code],
          },
        ],
        rules: [
          {
            attribute: "enabled_in_store",
            value: "true",
            operator: "eq" as const,
          },
          {
            attribute: "is_return",
            value: "false",
            operator: "eq" as const,
          },
        ],
      })),
    });
  }
};
