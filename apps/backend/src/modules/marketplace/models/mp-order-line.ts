import { model } from "@medusajs/framework/utils";

/**
 * One item inside one marketplace order (w12-marketplace-core).
 *
 * `line_key` is `${order external_id}|${line external_id}` and carries the
 * identity, for the same reason `mp_offer.offer_key` does: Postgres does not
 * dedupe a unique index over nullable columns, and a marketplace does not
 * always give a line its own id.
 *
 * `order_id` is the `mp_order.id` of the owner, so a re-projection updates
 * lines in place instead of doubling them.
 */
const MpOrderLine = model
  .define("mp_order_line", {
    id: model.id({ prefix: "mpline" }).primaryKey(),
    tenant_id: model.text(),
    marketplace: model.text(),
    /** `mp_order.id`. */
    order_id: model.text(),
    line_key: model.text(),
    vendor_code: model.text().nullable(),
    /** WB `nmID`, Ozon `sku` of the item in this line. */
    external_id: model.text().nullable(),
    qty: model.number().nullable(),
    price: model.bigNumber().nullable(),
    /** Percent on WB, absolute on Ozon where it is reported at all. */
    discount: model.bigNumber().nullable(),
    source_row_id: model.text(),
    synced_at: model.dateTime(),
  })
  .indexes([
    {
      on: ["tenant_id", "marketplace", "line_key"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      on: ["order_id"],
      where: "deleted_at IS NULL",
    },
  ]);

export default MpOrderLine;
