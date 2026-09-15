import { model } from "@medusajs/framework/utils";

/**
 * One Ozon shipment ("отправление"), mirrored from
 * `POST /v4/posting/fbs/list` and `POST /v3/posting/fbo/list`
 * (w11-ozon-readonly-client).
 *
 * Ozon's order unit is the POSTING, not the order: one order number
 * (`9121072335-0187`) splits into postings (`9121072335-0187-1`), and the
 * posting is what has a status, a warehouse and a set of products. So
 * `posting_number` is the identity and `order_number` is carried beside it.
 *
 * `scheme` says which list the row came from, because the two methods answer
 * for different fulfilment models and the panel has to tell them apart.
 *
 * Read-only: assembling, shipping, splitting or cancelling a posting are
 * `/v4/posting/fbs/ship`, `/v1/posting/fbs/split`, `/v2/posting/fbs/cancel`
 * and their siblings, all of them in `OZON_WRITE_PATHS`.
 */
const OzonPosting = model
  .define("ozon_posting", {
    id: model.id({ prefix: "ozpost" }).primaryKey(),
    tenant_id: model.text(),
    /** Ozon's id of the shipment, e.g. `9121072335-0187-1`. Unique in the cabinet. */
    posting_number: model.text(),
    /** The order this shipment belongs to, e.g. `9121072335-0187`. */
    order_number: model.text().nullable(),
    order_id: model.text().nullable(),
    /** `fbs` (from /v4/posting/fbs/list) or `fbo` (from /v3/posting/fbo/list). */
    scheme: model.text(),
    status: model.text().nullable(),
    substatus: model.text().nullable(),
    /** `products[]` verbatim: offer_id, sku, name, quantity and price per line. */
    products: model.json().nullable(),
    /** `analytics_data` verbatim: city, delivery type, warehouse, payment group. */
    analytics_data: model.json().nullable(),
    /** `financial_data` verbatim: per-product payout, commission and discounts. */
    financial_data: model.json().nullable(),
    /** Ozon's `created_at` for the shipment. */
    posting_created_at: model.dateTime().nullable(),
    /** Ozon's `in_process_at`: when the shipment entered processing. */
    in_process_at: model.dateTime().nullable(),
    cancel_reason_id: model.text().nullable(),
    source: model.text().default("ozon"),
    fetched_at: model.dateTime(),
    raw: model.json(),
  })
  .indexes([
    {
      on: ["tenant_id", "posting_number"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export default OzonPosting;
