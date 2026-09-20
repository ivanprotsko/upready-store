import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { REGIONS_BY_COUNTRY } from "../../../../shipping-tariffs/ru-regions";
import type { GetShippingRegionsQuery } from "../../../tenants/shipping-methods/validators";

/**
 * `GET /store/shipping-methods/regions?country_code=ru` — the same region list
 * the panel restricts zones with, for the checkout's manual address form: the
 * buyer picks a region from it, so the `province` written on the address is
 * the string the zone was built from. Behind the framework's publishable-key
 * gate on `/store/*`, like every store route.
 */
export const GET = async (req: MedusaRequest<unknown, GetShippingRegionsQuery>, res: MedusaResponse) => {
  const country = (req.validatedQuery.country_code ?? "ru").toLowerCase();
  res.json({ country_code: country, regions: REGIONS_BY_COUNTRY[country] ?? [] });
};
