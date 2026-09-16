import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { buildDesk, parseDeskFilters } from "../desk";
import { getTenantScope } from "../../tenant-scope";

/**
 * `GET /tenants/marketplaces/reviews` — the «Отзывы» tab of the desk
 * (w18-mp-reviews-desk).
 *
 * Reads `mp_review` and nothing else. No marketplace is contacted from this
 * handler: the rows arrive through the importers and the projector, and this
 * route only filters what is already in our database.
 *
 * Filters: marketplace · rating · «без ответа» · period. The response carries
 * which of them were actually applied, so an empty list can name the filter
 * that produced it instead of reading as «отзывов нет».
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const filters = parseDeskFilters(req.query as Record<string, unknown>);

  res.json(await buildDesk(req.scope, tenant.id, "reviews", filters));
};
