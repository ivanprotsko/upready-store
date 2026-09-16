import type { MedusaStoreRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import { listCities, listDeliveryPoints, type CdekPoint } from "../../../../cdek/client";
import { cdekApiCredentials, readCdekSecret } from "../../../../tenant-secrets/cdek";
import { resolveTenantFromPublishableKey } from "../../tenant/resolve-tenant";

/**
 * `GET /store/cdek/points?city=Санкт-Петербург&type=PVZ` — the CDEK pickup
 * points of one city, shaped for a map (i02-apiship-cdek-shipping).
 *
 * Why its own route rather than `/store/pickup-points`: that one lists the
 * shop's OWN stock locations seeded as pickup points, one shipping option each
 * (read its doc comment). CDEK's points are thousands of a carrier's offices,
 * none of them a shipping option and none of them in our database — one CDEK
 * method serves them all, and the buyer's choice travels on the shipping
 * method's `data.cdek_point_code`.
 *
 * The answer is trimmed to what a picker and a map need. The raw CDEK row
 * carries photos, an owner code and a dozen booleans; forwarding it would put
 * ~2 KB per point on the wire for 203 points.
 *
 * The shop is resolved from the publishable key, never from a query parameter:
 * the points come from the shop's OWN CDEK account, and a `tenant_id` a client
 * could type would let one shop spend another's rate limit.
 */
export async function GET(req: MedusaStoreRequest, res: MedusaResponse) {
  const tenant = await resolveTenantFromPublishableKey(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);

  const secret = await readCdekSecret(pg, tenant.id);
  const credentials = secret && cdekApiCredentials(secret);
  if (!secret || !credentials) {
    // Not «an error»: a shop without CDEK simply has no CDEK points, and the
    // checkout renders the rest of its methods.
    res.status(200).json({ points: [], configured: false, city: null });
    return;
  }

  const query = req.query as Record<string, string | undefined>;
  const cityName = (query.city ?? "").trim();
  const postalCode = (query.postal_code ?? "").trim();
  const type = query.type === "POSTAMAT" ? "POSTAMAT" : query.type === "ALL" ? "ALL" : "PVZ";

  let cityCode: number | null = query.city_code ? Number(query.city_code) : null;
  let cityLabel: string | null = cityName || null;

  if (!cityCode && (cityName || postalCode)) {
    const cities = await listCities(credentials, {
      city: cityName || undefined,
      postal_code: postalCode || undefined,
      size: 1,
    });
    cityCode = cities[0]?.code ?? null;
    cityLabel = cities[0]?.city ?? cityLabel;
  }

  if (!cityCode) {
    res.status(200).json({ points: [], configured: true, city: null });
    return;
  }

  const raw = await listDeliveryPoints(credentials, {
    city_code: cityCode,
    type,
    is_handout: true,
  });

  res.status(200).json({
    configured: true,
    city: { code: cityCode, name: cityLabel },
    points: raw.map(toStorePoint),
  });
}

/** The point shape the storefront picker and the map (`i03`) consume. */
export const toStorePoint = (point: CdekPoint) => ({
  code: point.code,
  name: point.name,
  type: point.type ?? "PVZ",
  address: point.location?.address_full ?? point.location?.address ?? "",
  city: point.location?.city ?? null,
  postal_code: point.location?.postal_code ?? null,
  lat: point.location?.latitude ?? null,
  lng: point.location?.longitude ?? null,
  work_time: point.work_time ?? null,
  phone: point.phones?.[0]?.number ?? null,
  note: point.address_comment ?? null,
  metro: point.nearest_metro_station ?? null,
  have_cashless: point.have_cashless ?? null,
  is_dressing_room: point.is_dressing_room ?? null,
  weight_max: point.weight_max ?? null,
});
