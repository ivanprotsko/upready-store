import { model } from "@medusajs/framework/utils";

/**
 * One marketplace listing of one shop, NORMALIZED (w12-marketplace-core).
 *
 * This is a DERIVED layer, not a second mirror. The row is computed from
 * `wb_product` / `ozon_product` by `projectFromMirrors`, and the raw mirrors
 * stay exactly as the marketplace answered them: when a normalisation turns
 * out to be wrong, it is recomputed from the raw rows without spending a
 * request and without a second import (spec 2.1).
 *
 * The key is `(tenant_id, marketplace, external_id)` — the same shape on every
 * marketplace, which is what lets one screen show both.
 *
 * `vendor_code` is the seller's own article (`vendorCode` on WB, `offer_id` on
 * Ozon). It is the column the shop's own catalog is matched on (`link.ts`),
 * and it is the reason one matcher covers both marketplaces.
 */
const MpProduct = model
  .define("mp_product", {
    id: model.id({ prefix: "mpprod" }).primaryKey(),
    tenant_id: model.text(),
    /** `wb` | `ozon`. Text, not an enum: the registry decides what exists, not this file. */
    marketplace: model.text(),
    /** WB `nmID`, Ozon `product_id`. Text: WB's numbers run past 4e10. */
    external_id: model.text(),
    vendor_code: model.text().nullable(),
    /** Ozon `sku`. WB has no card-level second identifier. */
    sku_external: model.text().nullable(),
    title: model.text().nullable(),
    brand: model.text().nullable(),
    category_name: model.text().nullable(),
    photos: model.json().nullable(),
    attributes: model.json().nullable(),
    /** When the card last changed ON the marketplace, where it says. */
    mp_updated_at: model.dateTime().nullable(),
    /** The id of the raw mirror row this was computed from. */
    source_row_id: model.text(),
    /** When this normalized row was last recomputed. */
    synced_at: model.dateTime(),
  })
  .indexes([
    {
      on: ["tenant_id", "marketplace", "external_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      on: ["tenant_id", "marketplace", "vendor_code"],
      where: "deleted_at IS NULL",
    },
  ]);

export default MpProduct;
