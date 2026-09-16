import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { getTenantScope } from "../../tenant-scope";
import { loadCatalog, thresholdsFromQuery } from "./catalog-data";

/**
 * `GET /tenants/marketplaces/catalog` — one catalog: every article of the shop
 * and of its marketplace cards, in one list (w14-mp-catalog-link).
 *
 * The row is the ARTICLE, so the same goods on WB and on Ozon are one line and
 * the four tab counts sum to the number of distinct articles. The arithmetic
 * is returned rather than left to the screen: `counts.accounted_for` is the
 * sum and `counts.total` is the number of rows, and they are equal by
 * construction (`modules/marketplace/catalog.ts`).
 *
 * This route WRITES NOTHING. Linking is `POST .../catalog/auto-link` and
 * `POST .../catalog/links`; a GET that quietly wrote links would make the
 * «сопоставление не сработало: 0 из N» state unreachable, which is the state
 * the owner most needs to see.
 *
 * Scoped by `getTenantScope`, like every other `/tenants/*` route: the tenant
 * comes from the token and never from the query.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const thresholds = thresholdsFromQuery(req.query as Record<string, unknown>);

  res.json(await loadCatalog(req.scope, tenant.id, thresholds));
};
