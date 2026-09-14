import type { MethodZone } from "../../../shipping-tariffs/tariff";

/**
 * A method zone as Medusa geo zones: one `country` zone for a whole country,
 * or one `province` zone per region. `province_code` is the exact string the
 * storefront writes into `shipping_address.province` (see `ru-regions.ts`),
 * because `listShippingOptionsForCartWorkflow` matches it verbatim.
 */
export const geoZonesOf = (zone: MethodZone) => {
  const country_code = zone.country_code.toLowerCase();
  if (!zone.provinces.length) {
    return [{ type: "country" as const, country_code }];
  }
  return zone.provinces.map((province_code) => ({
    type: "province" as const,
    country_code,
    province_code,
  }));
};

/**
 * Service zone names are unique across the whole backend (the fulfillment
 * module refuses a duplicate: «Service zone with name: X, already exists»,
 * measured 2026-09-15 when a second shop created «Почтой России»). The zone
 * is plumbing the customer never sees, so its name carries the set id and a
 * time suffix; the METHOD name lives on the shipping option.
 */
export const zoneNameFor = (methodName: string, fulfillmentSetId: string): string =>
  `${methodName} · ${fulfillmentSetId.slice(-8)} · ${Date.now().toString(36)}`;
