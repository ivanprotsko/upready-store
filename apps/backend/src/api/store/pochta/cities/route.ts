import type { MedusaStoreRequest, MedusaResponse } from "@medusajs/framework/http";

import { citiesMatching } from "../../../../pochta/method";
import { buyerPoints, pochtaContext, pochtaUnavailable } from "../helpers";

/**
 * `GET /store/pochta/cities?q=Мос` — the settlements that have Russian Post
 * pickup points, for the checkout's city search (46df-pochta).
 *
 * Built from the carrier's own directory, so every city offered has at least
 * one point and no third-party geocoder is involved. A shop without Russian
 * Post answers `configured: false` and an empty list, not an error.
 */
export async function GET(req: MedusaStoreRequest, res: MedusaResponse) {
  const { tenant, credentials } = await pochtaContext(req);
  if (!credentials) {
    res.status(200).json({ configured: false, cities: [] });
    return;
  }
  const term = String((req.query as Record<string, unknown>).q ?? "").trim();
  try {
    const points = await buyerPoints(credentials);
    res.status(200).json({ configured: true, cities: citiesMatching(points, term, 10) });
  } catch (error) {
    res.status(200).json({
      configured: true,
      cities: [],
      ...pochtaUnavailable(req, "/store/pochta/cities", tenant.id, error),
    });
  }
}
