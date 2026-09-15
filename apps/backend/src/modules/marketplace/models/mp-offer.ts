import { model } from "@medusajs/framework/utils";

/**
 * Price and stock of one marketplace listing, NORMALIZED
 * (w12-marketplace-core). The "one price and stock table" of the parity
 * matrix is exactly a projection of this table.
 *
 * WHY THIS IS NOT A COLUMN ON `mp_product`. On WB the price lives on the size
 * (`chrtID`) and the stock on the pair (warehouse, size). On Ozon the price
 * lives on the product and the stock on the pair (scheme, `sku`). One row per
 * item cannot hold either.
 *
 * `offer_key` is the identity: `${external_id}|${size_external}|${warehouse or
 * storage}`, built by the adapter's `normalize.offers`. A composite unique
 * index over nullable columns does not dedupe in Postgres, and filling an
 * absent dimension with a sentinel would be a value substituted for an absence
 * (rule 20a) — so the derived key is its own column and the dimensions stay
 * honestly `null`.
 *
 * `stock = null` means the marketplace said nothing about this line's stock.
 * It is not `0`, which would be a real claim about an empty warehouse.
 */
const MpOffer = model
  .define("mp_offer", {
    id: model.id({ prefix: "mpoffer" }).primaryKey(),
    tenant_id: model.text(),
    marketplace: model.text(),
    /** Derived identity of the line. See the head comment. */
    offer_key: model.text(),
    external_id: model.text(),
    vendor_code: model.text().nullable(),
    /** WB `chrtID`/`sizeID`. Ozon has no size dimension. */
    size_external: model.text().nullable(),
    /** Ozon `sku`; WB's barcode. */
    sku_external: model.text().nullable(),
    /** Ozon's FBO/FBS scheme. A scheme is not a warehouse, so it has its own column. */
    storage_type: model.text().nullable(),
    warehouse_id: model.text().nullable(),
    warehouse_name: model.text().nullable(),
    price: model.bigNumber().nullable(),
    discount_price: model.bigNumber().nullable(),
    currency: model.text().nullable(),
    stock: model.number().nullable(),
    reserved: model.number().nullable(),
    /** When the marketplace measured this line, as it reported it. */
    measured_at: model.dateTime().nullable(),
    source_row_id: model.text(),
    synced_at: model.dateTime(),
  })
  .indexes([
    {
      on: ["tenant_id", "marketplace", "offer_key"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      on: ["tenant_id", "marketplace", "external_id"],
      where: "deleted_at IS NULL",
    },
  ]);

export default MpOffer;
