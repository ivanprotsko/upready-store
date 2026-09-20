import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { getTenantScope } from "../../tenant-scope";
import { loadPriceStock, priceStockThresholdsFromQuery, tabFromQuery } from "./price-stock-data";

/**
 * `GET /tenants/marketplaces/price-stock` — one table of prices and stocks:
 * the shop and every marketplace, one row per article
 * (w17-mp-price-stock-table, row 4 of the parity matrix).
 *
 * ONLY GET, here and in the two routes beside it. Ivan's standing invariant of
 * 2026-09-16 02:46 WITA is that this screen never edits a marketplace price or
 * stock — no inline edit, no bulk action, no «отправить на площадку» — and a
 * `POST` in this directory would be a route Medusa registers whatever its body
 * does. `__tests__/price-stock-read-only.unit.spec.ts` fails on one.
 *
 * `counts` is always of the WHOLE table and `rows` is of the tab, so the tab
 * labels do not change as the owner clicks between them and the arithmetic
 * «везде есть + нет на площадке + нет в магазине = всего» stays checkable on
 * any tab.
 *
 * Scoped by `getTenantScope` like every `/tenants/*` route: the tenant comes
 * from the token and never from the query.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const query = req.query as Record<string, unknown>;

  res.json(
    await loadPriceStock(req.scope, tenant.id, {
      thresholds: priceStockThresholdsFromQuery(query),
      tab: tabFromQuery(query),
    }),
  );
};
