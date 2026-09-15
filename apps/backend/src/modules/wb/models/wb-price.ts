import { model } from "@medusajs/framework/utils";

/**
 * The price and discount of one WB listing, mirrored from
 * `GET /api/v2/list/goods/filter` (w01-wb-readonly-client).
 *
 * Read-only mirror, like `wb_product`: this row is never sent back to WB.
 *
 * WB prices differ per size, so the per-size figures stay in `sizes` as the
 * API returns them (`sizeID`, `price`, `discountedPrice`, `techSizeName`) and
 * the columns hold what is common to the item. `currency_iso` is WB's own
 * field name for the currency of those amounts.
 */
const WbPrice = model
  .define("wb_price", {
    id: model.id({ prefix: "wbprice" }).primaryKey(),
    tenant_id: model.text(),
    nm_id: model.text(),
    vendor_code: model.text().nullable(),
    currency_iso: model.text().nullable(),
    /** Seller discount in percent, as WB reports it for the item. */
    discount: model.number().nullable(),
    /** WB Club discount in percent, when the cabinet takes part. */
    club_discount: model.number().nullable(),
    /** WB's flag for "this item's sizes are priced separately". */
    editable_size_price: model.boolean().nullable(),
    /** `sizes[]` verbatim: one entry per `sizeID` with its price and discounted price. */
    sizes: model.json().nullable(),
    source: model.text().default("wb"),
    fetched_at: model.dateTime(),
    raw: model.json(),
  })
  .indexes([
    {
      on: ["tenant_id", "nm_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export default WbPrice;
