import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { getTenantScope } from "../../../../tenant-scope";
import { marketplaceOf } from "../../products/products-data";
import { loadPriceStockLines } from "../price-stock-data";

/**
 * `GET /tenants/marketplaces/:marketplace/price-stock/lines?external_id=…` —
 * the drawer «Строки по складам» of one row (task-03): every size on every
 * warehouse behind the card, as `MpOfferLine` of the panel's contract.
 *
 * The id travels in the QUERY, the way the w17 expansion carried the article,
 * so one shape serves an nmID and an Ozon `product_id` alike.
 *
 * An absent `external_id` is a 400 and not an empty list: an empty drawer
 * would read as «у карточки нет строк», a claim about the data made out of a
 * caller's mistake (rule 20a). A card of another shop is a 404.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const adapter = marketplaceOf(req.params.marketplace);
  const raw = (req.query as Record<string, unknown>).external_id;
  const externalId = raw === undefined || raw === null ? "" : String(raw).trim();

  if (!externalId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Нужен параметр external_id — карточка, строки которой показываем.",
    );
  }

  res.json(await loadPriceStockLines(req.scope, tenant.id, adapter, externalId));
};
