import type { MedusaStoreRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import { ApishipError, listPoints, type ApishipPoint, type ApishipPointType } from "../../../../apiship/client";
import { apishipApiCredentials, readApishipSecretPublic } from "../../../../tenant-secrets/apiship";
import { resolveTenantFromPublishableKey } from "../../tenant/resolve-tenant";

/**
 * `GET /store/apiship/points?provider_key=cdek&city=Санкт-Петербург[&types=1,2][&limit=300]`
 * — the pickup points of one carrier in one city, from ApiShip, shaped for the
 * checkout picker and its map (t-2026-10-14-58, checklist 2).
 *
 * Why its own route rather than `/store/pickup-points`: that one lists the
 * shop's OWN stock locations seeded as pickup points. A carrier's points are
 * thousands of offices none of which is in our database — one ApiShip method
 * serves them all, and the buyer's choice travels on the shipping method's
 * `data.apiship_point_id`.
 *
 * The shop is resolved from the publishable key, never from a query
 * parameter: the points come from the shop's OWN ApiShip token.
 *
 * `types` are ApiShip's point types: 1 pickup point, 2 parcel locker, 3 post
 * office, 4 terminal. Without it every type that hands parcels out is listed.
 */
export async function GET(req: MedusaStoreRequest, res: MedusaResponse) {
  const tenant = await resolveTenantFromPublishableKey(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const api = apishipApiCredentials(
    await readApishipSecretPublic(pg, tenant.id, req.scope.resolve(ContainerRegistrationKeys.LOGGER)),
  );

  const query = req.query as Record<string, string | undefined>;
  const providerKey = (query.provider_key ?? "").trim();
  const city = (query.city ?? "").trim();

  if (!api || !providerKey) {
    // Not «an error»: a shop without ApiShip simply has no ApiShip points, and
    // the checkout renders the rest of its methods.
    res.status(200).json({ configured: Boolean(api), provider_key: providerKey || null, city: city || null, points: [], total: 0 });
    return;
  }
  if (!city) {
    res.status(200).json({ configured: true, provider_key: providerKey, city: null, points: [], total: 0 });
    return;
  }

  const types = (query.types ?? "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value): value is ApishipPointType => value === 1 || value === 2 || value === 3 || value === 4);
  const limit = Math.min(1000, Math.max(1, Number(query.limit) || 500));

  try {
    const { points, total } = await listPoints(api, { providerKey, city, types, limit });
    res.status(200).json({
      configured: true,
      provider_key: providerKey,
      city,
      total,
      points: points.filter((point) => point.enabled !== false).map(toStorePoint),
    });
  } catch (error) {
    if (error instanceof ApishipError && error.status !== null && error.status < 500) {
      // «У Вашей компании нет подключенных СД» and the like: the carrier is not
      // connected in the cabinet, so there are no points, and the sentence is
      // kept for the log rather than shown to a buyer.
      req.scope.resolve(ContainerRegistrationKeys.LOGGER).warn(`[apiship] points refused for tenant ${tenant.id}: ${error.detail}`);
      res.status(200).json({ configured: true, provider_key: providerKey, city, points: [], total: 0 });
      return;
    }
    throw error;
  }
}

/** The point shape the storefront picker and the map consume. */
export const toStorePoint = (point: ApishipPoint) => ({
  id: point.id,
  code: point.code,
  name: point.name,
  type: point.type,
  address: point.address,
  city: point.city,
  region: point.region,
  postal_code: point.postIndex,
  lat: point.lat,
  lng: point.lng,
  work_time: point.timetable,
  phone: point.phone,
  note: point.description,
  have_cashless: point.paymentCard,
  is_dressing_room: point.fittingRoom,
  weight_max: point.limits?.maxWeight ?? null,
});
