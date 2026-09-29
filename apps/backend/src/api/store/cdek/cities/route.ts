import type { MedusaStoreRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import { listCities, suggestCities } from "../../../../cdek/client";
import { cdekApiCredentials, readCdekSecretPublic } from "../../../../tenant-secrets/cdek";
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

  const secret = await readCdekSecretPublic(pg, tenant.id, req.scope.resolve(ContainerRegistrationKeys.LOGGER));
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

  // A field the buyer types into needs PREFIX matching, and
  // `/location/cities?city=` matches exactly (measured 2026-09-16: `Санкт-Пет`
  // → `[]`, `Санкт-Петербург` → one row). `/location/suggest/cities` does the
  // prefix, so it answers first; the exact lookup fills in the coordinates the
  // suggest row does not carry, and covers a full name typed or pasted whole.
  const limit = Math.min(20, Number(query.limit) || 10);
  const suggested = await suggestCities(credentials, { name: term });

  if (suggested.length) {
    res.status(200).json({
      configured: true,
      cities: suggested.slice(0, limit).map((city) => ({
        code: city.code,
        city: city.full_name.split(",")[0].trim(),
        region: city.full_name.split(",").slice(1).join(",").trim() || null,
        lat: null,
        lng: null,
      })),
    });
    return;
  }

  const cities = await listCities(credentials, { city: term, size: limit });
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
