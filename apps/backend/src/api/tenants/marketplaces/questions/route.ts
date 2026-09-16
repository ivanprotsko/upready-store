import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { buildDesk, parseDeskFilters } from "../desk";
import { getTenantScope } from "../../tenant-scope";

/**
 * `GET /tenants/marketplaces/questions` — the «Вопросы» tab of the desk
 * (w18-mp-reviews-desk).
 *
 * Reads `mp_question` and nothing else. No marketplace is contacted from this
 * handler: the rows arrive through the importers and the projector, and this
 * route only filters what is already in our database.
 *
 * Filters: marketplace · «без ответа» · period (a question carries no rating,
 * so the rating control is not shown on this tab and a rating in the query
 * changes nothing here). The response carries
 * which of them were actually applied, so an empty list can name the filter
 * that produced it instead of reading as «вопросов нет».
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const filters = parseDeskFilters(req.query as Record<string, unknown>);

  res.json(await buildDesk(req.scope, tenant.id, "questions", filters));
};
