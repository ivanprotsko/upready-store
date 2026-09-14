import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { REGIONS_BY_COUNTRY } from "../../../../shipping-tariffs/ru-regions";
import type { GetShippingRegionsQuery } from "../validators";

/** `GET /tenants/shipping-methods/regions?country_code=ru` — the regions a zone can be restricted to. Empty for a country without a list. */
export const GET = async (req: AuthenticatedMedusaRequest<unknown, GetShippingRegionsQuery>, res: MedusaResponse) => {
  const country = (req.validatedQuery.country_code ?? "ru").toLowerCase();
  res.json({ country_code: country, regions: REGIONS_BY_COUNTRY[country] ?? [] });
};
