import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { getTenantScope } from "../../../../tenant-scope";
import { loadProductCard, marketplaceOf } from "../products-data";

/**
 * `GET /tenants/marketplaces/:marketplace/products/:id` — the card page of
 * «Wildberries → Товары» (task-02 of mp-section-design): one `mp_product` with
 * its price and stock lines (size × warehouse), photos, characteristics and
 * its link to the shop.
 *
 * `:id` is the `mp_product.id`. A card of another shop is a 404, the same as
 * a card that does not exist. ONLY GET, and only our database is read.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const adapter = marketplaceOf(req.params.marketplace);

  res.json(await loadProductCard(req.scope, tenant.id, adapter, String(req.params.id)));
};
