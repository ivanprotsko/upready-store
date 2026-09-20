import { model } from "@medusajs/framework/utils";

/**
 * One order line from WB statistics, mirrored from
 * `GET /api/v1/supplier/orders` (w01-wb-readonly-client).
 *
 * WB's own note on that method: "1 line means 1 order and means 1 item. The
 * srid field should be used to identify the order." So `srid` is the identity
 * here, and the mirror is idempotent on (tenant, srid).
 *
 * WB guarantees this data for no more than 90 days, which is why the sync
 * takes a bounded window rather than pretending to hold a full history.
 */
const WbOrder = model
  .define("wb_order", {
    id: model.id({ prefix: "wborder" }).primaryKey(),
    tenant_id: model.text(),
    /** WB's unique id of the order line. */
    srid: model.text(),
    nm_id: model.text().nullable(),
    supplier_article: model.text().nullable(),
    barcode: model.text().nullable(),
    /** WB's `totalPrice`, before the seller discount. */
    total_price: model.bigNumber().nullable(),
    /** WB's `discountPercent`. */
    discount_percent: model.number().nullable(),
    /** WB's `finishedPrice`: what the customer paid. */
    finished_price: model.bigNumber().nullable(),
    is_cancel: model.boolean().default(false),
    warehouse_name: model.text().nullable(),
    region_name: model.text().nullable(),
    /** WB's `date`: when the order was made. */
    order_date: model.dateTime().nullable(),
    /** WB's `lastChangeDate`: the cursor the next page starts from. */
    last_change_date: model.dateTime().nullable(),
    source: model.text().default("wb"),
    fetched_at: model.dateTime(),
    raw: model.json(),
  })
  .indexes([
    {
      on: ["tenant_id", "srid"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export default WbOrder;
