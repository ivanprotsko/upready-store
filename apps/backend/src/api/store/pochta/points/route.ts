import type { MedusaStoreRequest, MedusaResponse } from "@medusajs/framework/http";

import { listNearbyPostOffices } from "../../../../pochta/client";
import {
  citiesMatching,
  fromPostOffice,
  pointsInCity,
  pointsNear,
  withoutFarOutliers,
  type PochtaStorePoint,
} from "../../../../pochta/method";
import { buyerPoints, pochtaContext, pochtaUnavailable } from "../helpers";

const MAX_RADIUS_KM = 50;

/**
 * `GET /store/pochta/points?city=Москва` or `?lat=55.75&lng=37.62&radius_km=10`
 * — Russian Post pickup points for the checkout's map and list (46df-pochta).
 *
 * By city: the points of that settlement in the directory (the city's own
 * name, with or without «г.»). By coordinates: the points within the radius,
 * nearest first. With the shop's user key, post offices around the same centre
 * join the list (not measured: no shop has a user key yet, and a failure there
 * leaves the directory points alone).
 */
export async function GET(req: MedusaStoreRequest, res: MedusaResponse) {
  const { tenant, credentials } = await pochtaContext(req);
  if (!credentials) {
    res.status(200).json({ configured: false, city: null, points: [] });
    return;
  }

  const query = req.query as Record<string, string | undefined>;
  const cityName = (query.city ?? "").trim();
  const region = (query.region ?? "").trim() || null;
  const lat = Number(query.lat);
  const lng = Number(query.lng);
  const radius = Math.min(MAX_RADIUS_KM, Math.max(1, Number(query.radius_km) || 15));

  let all: PochtaStorePoint[];
  try {
    all = await buyerPoints(credentials);
  } catch (error) {
    res.status(200).json({
      configured: true,
      city: null,
      points: [],
      ...pochtaUnavailable(req, "/store/pochta/points", tenant.id, error),
    });
    return;
  }

  let points: PochtaStorePoint[] = [];
  let city: { name: string; region: string | null; lat: number; lng: number } | null = null;

  if (cityName) {
    points = withoutFarOutliers(pointsInCity(all, cityName, region));
    const match = citiesMatching(points, cityName, 1)[0];
    if (match) city = { name: match.name, region: match.region, lat: match.lat, lng: match.lng };
  } else if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
    points = pointsNear(all, { lat, lng }, radius);
    city = { name: "", region: null, lat, lng };
  }

  if (credentials.user_key && city) {
    try {
      const offices = await listNearbyPostOffices(credentials, { lat: city.lat, lng: city.lng, top: 30 });
      points = [...points, ...offices.map(fromPostOffice).filter((point): point is PochtaStorePoint => Boolean(point))];
    } catch {
      // The directory points are still a complete answer on their own.
    }
  }

  res.status(200).json({ configured: true, city, points });
}
