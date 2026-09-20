import { model } from "@medusajs/framework/utils";

/**
 * One FBS assembly order, mirrored from `GET /api/v3/orders/new` and
 * `GET /api/v3/orders`, with the two status fields filled in by
 * `POST /api/v3/orders/status` (w23-wb-write-fbs-orders).
 *
 * Identity is WB's own `id` (int64, "Assembly order ID"), held as text because
 * an int64 does not survive JavaScript's number range in general. The mirror
 * is idempotent on (tenant, order_id).
 *
 * Why the columns are named after WB's fields and not after ours: the names
 * below were MEASURED against the live cabinet on 2026-09-16, not taken from
 * the documentation, whose response samples the portal renders collapsed
 * (`{"orders": [{}]}`). The measurement is quoted in the branch report.
 *
 * What is deliberately NOT mirrored: `address` (the buyer's delivery address),
 * `comment` and `userId`. They arrive in the answer and are dropped before the
 * row is written (`stripOrderPii` in `../sync.ts`), because the desk needs a
 * status and an article, and a shop's database is not the place to keep a
 * stranger's address it has no use for. `raw` holds everything else.
 */
const WbFbsOrder = model
  .define("wb_fbs_order", {
    id: model.id({ prefix: "wbfbs" }).primaryKey(),
    tenant_id: model.text(),
    /** WB's `id`: the assembly order id every FBS method takes. */
    order_id: model.text(),
    /** WB's `rid`. A second identifier WB uses in its own interfaces. */
    rid: model.text().nullable(),
    /** WB's `orderUid`: orders of one basket share it. */
    order_uid: model.text().nullable(),
    /**
     * WB's `supplyId`, present in `GET /api/v3/orders` once the order is in a
     * supply. `null` while the order is new.
     */
    supply_id: model.text().nullable(),
    /**
     * WB's `supplierStatus`: new, confirm, complete, cancel, cancel_carrier.
     * Filled by the status import, `null` until it has run.
     */
    supplier_status: model.text().nullable(),
    /** WB's `wbStatus`: waiting, sorted, sold, canceled, … */
    wb_status: model.text().nullable(),
    /** WB's `isCancellable`. `null` means "not asked", never "no". */
    is_cancellable: model.boolean().nullable(),
    /** WB's `isTransferable`. */
    is_transferable: model.boolean().nullable(),
    nm_id: model.text().nullable(),
    chrt_id: model.text().nullable(),
    /** WB's `article`: the seller's own vendor code. */
    article: model.text().nullable(),
    /** WB's `skus`: the barcodes of the ordered size. */
    skus: model.json().nullable(),
    /** WB's `price`, in its own units. See the report for the measurement. */
    price: model.bigNumber().nullable(),
    /** WB's `convertedPrice`, the same amount in the seller's currency. */
    converted_price: model.bigNumber().nullable(),
    /** WB's `currencyCode`: ISO 4217 numeric (643 = RUB). */
    currency_code: model.text().nullable(),
    /** WB's `deliveryType`: fbs, dbs, wbgo. */
    delivery_type: model.text().nullable(),
    /** WB's `cargoType`: a supply may hold only one of these. */
    cargo_type: model.number().nullable(),
    warehouse_id: model.text().nullable(),
    office_id: model.text().nullable(),
    /** WB's `createdAt`: when the buyer placed the order. */
    wb_created_at: model.dateTime().nullable(),
    /** When the statuses above were last asked for. */
    status_fetched_at: model.dateTime().nullable(),
    source: model.text().default("wb"),
    fetched_at: model.dateTime(),
    /** The answer as it came, minus the three PII fields named above. */
    raw: model.json(),
  })
  .indexes([
    {
      on: ["tenant_id", "order_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      on: ["tenant_id", "supplier_status"],
      where: "deleted_at IS NULL",
    },
  ]);

export default WbFbsOrder;
