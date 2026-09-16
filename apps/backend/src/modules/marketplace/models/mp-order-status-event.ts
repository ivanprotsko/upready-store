import { model } from "@medusajs/framework/utils";

/**
 * One OBSERVED status of one marketplace order (w15-mp-orders-desk).
 *
 * WHAT THIS IS, EXACTLY. Neither marketplace hands us a status log: WB answers
 * the CURRENT `supplierStatus`/`wbStatus` of an assembly order and Ozon the
 * CURRENT `status`/`substatus` of a posting. So the history on the order card
 * is the history WE can honestly own — what the value was every time an import
 * looked at it. The projector writes a row here the first time it sees an
 * order and then only when the pair of strings has changed, so the table is a
 * change log and not one row per run.
 *
 * Calling this "история статусов площадки" on the screen would be an
 * invention: the screen says «что мы видели при загрузках», and `observed_at`
 * is our clock, not theirs. Where the marketplace does state when it changed
 * the status itself, that value is on `mp_order.status_changed_at` and the
 * card shows it separately.
 *
 * `order_id` is the `mp_order.id`, for the same reason `mp_order_line` carries
 * it: the row belongs to an order of ours, and the marketplace's own
 * identifier is already on that order.
 */
const MpOrderStatusEvent = model
  .define("mp_order_status_event", {
    id: model.id({ prefix: "mpstev" }).primaryKey(),
    tenant_id: model.text(),
    marketplace: model.text(),
    /** `mp_order.id`. */
    order_id: model.text(),
    /**
     * `${order_id}|${observed_at ISO}`: the identity of one observation. The
     * projector is idempotent, and a re-run that sees the same pair must not
     * write a second row; a derived key is how every other table of this
     * module says that (`offer_key`, `line_key`).
     */
    event_key: model.text(),
    /** The seller-facing string, exactly as the marketplace wrote it. */
    status: model.text().nullable(),
    /** The second string (WB `wbStatus`, Ozon `substatus`), unchanged. */
    status_detail: model.text().nullable(),
    /** When the marketplace says the status last changed, where it says. */
    status_changed_at: model.dateTime().nullable(),
    /** When WE saw this value. Our clock, and labelled as ours on the screen. */
    observed_at: model.dateTime(),
  })
  .indexes([
    {
      on: ["tenant_id", "marketplace", "event_key"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      on: ["order_id", "observed_at"],
      where: "deleted_at IS NULL",
    },
  ]);

export default MpOrderStatusEvent;
