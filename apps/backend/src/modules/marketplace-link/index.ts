import { Module } from "@medusajs/framework/utils";
import MarketplaceLinkModuleService from "./service";

/**
 * Which product of a shop is which listing on a marketplace
 * (w07-tenant-catalog-enrich).
 *
 * One table, `product_marketplace_link`. It is deliberately NOT part of the
 * `wb` module: that module mirrors one marketplace and must stay a read-only
 * mirror of it, while this row belongs to the shop's own catalog and names the
 * marketplace in a column so a second one costs no new table.
 */
export const MARKETPLACE_LINK_MODULE = "marketplace_link";

export default Module(MARKETPLACE_LINK_MODULE, {
  service: MarketplaceLinkModuleService,
});
