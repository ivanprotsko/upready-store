import { model } from "@medusajs/framework/utils";

/**
 * One order or shipment of a marketplace, NORMALIZED (w12-marketplace-core).
 * The "single order feed" of the parity matrix reads this table and nothing
 * else, which is the reason it exists.
 *
 * WB's statistics method answers one line per item and says "the srid field
 * should be used to identify the order"; Ozon's unit is the posting
 * (`posting_number`). Both become one row here, with the items in
 * `mp_order_line`.
 *
 * `scheme` is `null` where the marketplace's own method does not say which one
 * it is. WB's statistics orders do not, and guessing FBS from a warehouse name
 * would be an invention (rule 17a).
 */
const MpOrder = model
  .define("mp_order", {
    id: model.id({ prefix: "mporder" }).primaryKey(),
    tenant_id: model.text(),
    marketplace: model.text(),
    /** WB `srid`, Ozon `posting_number`. */
    external_id: model.text(),
    /** FBS | FBO | DBS | rFBS, or null where the method does not say. */
    scheme: model.text().nullable(),
    status: model.text().nullable(),
    /**
     * The marketplace's SECOND status string, where it has one, kept raw
     * (w15-mp-orders-desk).
     *
     * Both marketplaces answer with two: Wildberries an FBS assembly order
     * carries `supplierStatus` (what the seller did) next to `wbStatus` (where
     * the parcel is), and Ozon a posting carries `status` next to `substatus`.
     * Flattening the pair into one column would drop the half the owner needs
     * to tell "я собрал" from "покупатель отказался", and inventing a combined
     * vocabulary of our own would replace the marketplace's word with ours
     * (rule 17a). So `status` holds the seller-facing string, this holds the
     * other one, and both reach the order card unchanged.
     */
    status_detail: model.text().nullable(),
    status_changed_at: model.dateTime().nullable(),
    ordered_at: model.dateTime().nullable(),
    buyer_region: model.text().nullable(),
    warehouse_name: model.text().nullable(),
    total: model.bigNumber().nullable(),
    currency: model.text().nullable(),
    is_cancelled: model.boolean().default(false),
    source_row_id: model.text(),
    synced_at: model.dateTime(),
  })
  .indexes([
    {
      on: ["tenant_id", "marketplace", "external_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      on: ["tenant_id", "marketplace", "ordered_at"],
      where: "deleted_at IS NULL",
    },
  ]);

export default MpOrder;
