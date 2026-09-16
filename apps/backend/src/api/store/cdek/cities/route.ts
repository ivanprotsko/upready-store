import type { MedusaStoreRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import { listCities } from "../../../../cdek/client";
import { cdekApiCredentials, readCdekSecret } from "../../../../tenant-secrets/cdek";
import { resolveTenantFromPublishableKey } from "../../tenant/resolve-tenant";

/**
 * `GET /store/cdek/cities?q=Санкт` — CDEK's own city directory, for the city
 * field of the checkout address and for the point picker's city switch
 * (i02-apiship-cdek-shipping).
 *
 * This is NOT the address autocomplete Ivan asked for in point 3.2 of the order
 * (that one is DaData and belongs to the address sheet, task i03): CDEK's
 * directory knows cities and their numeric codes, which is what every other CDEK
 * call wants, and nothing about streets or houses.
 */
export async function GET(req: MedusaStoreRequest, res: MedusaResponse) {
  const tenant = await resolveTenantFromPublishableKey(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);

  const secret = await readCdekSecret(pg, tenant.id);
  const credentials = secret && cdekApiCredentials(secret);
  if (!secret || !credentials) {
    res.status(200).json({ cities: [], configured: false });
    return;
  }

  const query = req.query as Record<string, string | undefined>;
  const term = (query.q ?? query.city ?? "").trim();
  if (term.length < 2) {
    res.status(200).json({ cities: [], configured: true });
    return;
  }

  const cities = await listCities(credentials, {
    city: term,
    country_codes: "RU",
    size: Math.min(20, Number(query.limit) || 10),
  });

  res.status(200).json({
    configured: true,
    cities: cities.map((city) => ({
      code: city.code,
      city: city.city,
      region: city.region ?? null,
      lat: city.latitude ?? null,
      lng: city.longitude ?? null,
    })),
  });
}
