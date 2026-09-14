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
