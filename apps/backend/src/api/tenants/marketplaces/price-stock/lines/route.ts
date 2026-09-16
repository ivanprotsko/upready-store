import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { getTenantScope } from "../../../tenant-scope";
import { loadPriceStockLines } from "../price-stock-data";

/**
 * `GET /tenants/marketplaces/price-stock/lines?vendor_code=…` — the expansion
 * of one row: every warehouse and every size of that article, per marketplace.
 *
 * The article travels in the QUERY and not in the path: a vendor code is the
 * seller's own string and this shop's real ones carry spaces, commas and
 * slashes («Мазь АСД 15% 100 мл /жиры пищевые/»), which a path segment would
 * have to survive twice over.
 *
 * An absent `vendor_code` is a 400 and not an empty list: an empty expansion
 * would read as «у артикула нет строк», which is a claim about the data made
 * out of a caller's mistake (rule 20a).
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const raw = (req.query as Record<string, unknown>).vendor_code;
  const vendorCode = raw === undefined || raw === null ? "" : String(raw).trim();

  if (!vendorCode) {
    res.status(400).json({
      message: "Нужен параметр vendor_code — артикул, строки которого разворачиваем.",
    });
    return;
  }

  res.json(await loadPriceStockLines(req.scope, tenant.id, vendorCode));
};
