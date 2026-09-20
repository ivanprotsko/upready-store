import { model } from "@medusajs/framework/utils";

/** Marketplaces a link can point at. Only Wildberries has a mirror today (w01). */
export const MARKETPLACES = ["wb", "ozon"] as const;
export type Marketplace = (typeof MARKETPLACES)[number];

/**
 * How a product of the shop was tied to a listing of a marketplace, in the
 * order the matcher tries them. The value is kept on the row because a link
 * found by a weak rule has to be auditable later: the owner reading the report
 * must see WHY this product got that card.
 *
 * `sku_nm_id`      the variant's SKU carries the marketplace item number
 *                  (measured on the migrated Cherkashina catalog: every SKU is
 *                  `<nmID>-CHERKASHINO`)
 * `vendor_code`    the variant's SKU IS the seller's own article
 * `metadata_nm_id` the product's `metadata.wb_nm_id`, written by an earlier run
 *                  or by a migration
 * `manual`         a person tied them by hand
 */
export const MATCH_KINDS = ["sku_nm_id", "vendor_code", "metadata_nm_id", "manual"] as const;
export type MatchKind = (typeof MATCH_KINDS)[number];

/**
 * One product of one shop tied to one listing of one marketplace
 * (w07-tenant-catalog-enrich).
 *
 * The enrichment needs to know, for every product it touches, which card it
 * took the title, the price, the characteristics, the reviews and the photos
 * from — and it has to give the same answer on the live host, where the WB key
 * is absent and the data arrives as an exported dataset. So the pairing is a
 * ROW rather than a rule recomputed at every run: a matcher that changes its
 * mind between two runs would enrich a product from one card today and from
 * another tomorrow, silently.
 *
 * Scope is `tenant_id`, the shape `product_review` and the wb_* mirrors
 * already use. `external_id` is the marketplace's own item number (`nmID` for
 * WB), text for the same reason `wb_product.nm_id` is text: WB's numbers run
 * past 4e10 and nothing does arithmetic on one.
 *
 * `variant_id` is nullable because a card is matched through a variant's SKU
 * but describes the PRODUCT: a product with several variants keeps one link
 * and names the variant the SKU came from.
 *
 * One product carries at most one live link per marketplace, which is what
 * makes a re-run update instead of doubling.
 */
const ProductMarketplaceLink = model
  .define("product_marketplace_link", {
    id: model.id({ prefix: "pmlink" }).primaryKey(),
    tenant_id: model.text(),
    product_id: model.text(),
    /** The variant whose SKU produced the match, when one did. */
    variant_id: model.text().nullable(),
    marketplace: model.enum([...MARKETPLACES]).default("wb"),
    /** `nmID` for Wildberries. */
    external_id: model.text(),
    /** The seller's own article on that marketplace (`vendorCode`), for the report. */
    vendor_code: model.text().nullable(),
    matched_by: model.enum([...MATCH_KINDS]),
    linked_at: model.dateTime(),
  })
  .indexes([
    {
      on: ["tenant_id", "marketplace", "product_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      on: ["tenant_id", "marketplace", "external_id"],
      where: "deleted_at IS NULL",
    },
  ]);

export default ProductMarketplaceLink;
