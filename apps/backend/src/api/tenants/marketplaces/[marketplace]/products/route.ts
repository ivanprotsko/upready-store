import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { parseProductsQuery } from "../../../../../modules/marketplace/products-list";
import { getTenantScope } from "../../../tenant-scope";
import { loadProductsPage, marketplaceOf } from "./products-data";

/**
 * `GET /tenants/marketplaces/:marketplace/products` — «Wildberries → Товары»
 * (task-02 of mp-section-design): the marketplace's cards as the import stored
 * them, paged, filtered, searched and sorted by the server.
 *
 *   ?limit&offset&q&order&link_state&category&brand&synced_at
 *
 * The contract is `MpProductsResponse` in the panel's
 * `hooks/api/marketplace-section.tsx`; the rules behind every field are in
 * `modules/marketplace/products-list.ts`.
 *
 * ONLY GET. This screen reads our database and nothing else: no request to
 * the marketplace when it opens, and no write to it ever (Ivan, 2026-09-16
 * 02:46 WITA). Linking a card to the shop is `POST /tenants/marketplaces/
 * catalog/links` (w14), which writes `mp_link` and nothing on the marketplace.
 *
 * Scoped by `getTenantScope` like every `/tenants/*` route: the tenant comes
 * from the token and never from the query.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const adapter = marketplaceOf(req.params.marketplace);
  const query = parseProductsQuery(req.query as Record<string, unknown>);

  res.json(await loadProductsPage(req.scope, tenant.id, adapter, query));
};
