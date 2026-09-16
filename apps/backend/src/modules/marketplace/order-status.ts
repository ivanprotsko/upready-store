/**
 * The marketplace's own status string -> ONE key the feed can filter on
 * (w15-mp-orders-desk).
 *
 * THE RAW STRING IS NEVER REPLACED. `mp_order.status` and
 * `mp_order.status_detail` keep exactly what the marketplace wrote, the order
 * card shows both, and this mapping only exists so that one filter can span
 * three sources whose vocabularies have nothing in common. A value this table
 * does not know maps to `other` and is still shown as itself, because a status
 * we cannot place is a status we must not rename (rule 17a).
 *
 * WHERE THE WILDBERRIES VOCABULARY COMES FROM: the saved copy of WB's own FBS
 * page, `artifacts/docs/w10-marketplace-spec/docs/dev.wildberries.ru-en-orders-fbs.txt`,
 * lines 228-258 — the `supplierStatus` table and the `wbStatus` list, with WB's
 * own description of each. Two of them decide a mapping that would otherwise
 * be a guess: `defect` is described as "cancellation of the order due to a
 * defect" (so: cancelled, not «брак» as a state of its own), and
 * `ready_for_pickup` as "the order came at pickup point and waiting for the
 * client" (so: still on its way to the buyer, not delivered).
 *
 * WHERE THE OZON VOCABULARY COMES FROM: the saved copy
 * `docs.ozon.ru-api-seller-index.txt`, which documents the statuses it names in
 * prose (`awaiting_packaging`, `awaiting_approve`, `awaiting_verification`,
 * `awaiting_deliver`, `client_arbitration`, `arbitration`, `delivering`) rather
 * than in one table. The full posting-status table is on a page the saved
 * copies do not hold; the report says so, and every status outside this list
 * lands in `other` with its own string on the screen.
 */

/** The keys the filter offers. `other` is a real answer, not a gap. */
export const ORDER_STATUS_KEYS = [
  "new",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
  "other",
] as const;
export type OrderStatusKey = (typeof ORDER_STATUS_KEYS)[number];

/** What the owner reads on the screen. Plain Russian, no enum ever shown raw (rule 18e). */
export const ORDER_STATUS_LABELS: Record<OrderStatusKey, string> = {
  new: "Новый",
  processing: "В сборке",
  shipped: "В доставке",
  delivered: "Доставлен",
  cancelled: "Отменён",
  returned: "Возврат",
  other: "Другой статус площадки",
};

/**
 * Wildberries `wbStatus` values that END the order whatever the seller's own
 * status says. WB's page describes each of them as a cancellation or as the
 * sale itself, so they win over `supplierStatus`.
 */
const WB_TERMINAL: Record<string, OrderStatusKey> = {
  sold: "delivered",
  canceled: "cancelled",
  canceled_by_client: "cancelled",
  declined_by_client: "cancelled",
  canceled_by_carrier: "cancelled",
  defect: "cancelled",
};

/** Wildberries `wbStatus` values that say where the parcel is. */
const WB_PROGRESS: Record<string, OrderStatusKey> = {
  waiting: "processing",
  sorted: "shipped",
  ready_for_pickup: "shipped",
  postponed_delivery: "shipped",
  accepted_by_carrier: "shipped",
  sent_to_carrier: "shipped",
};

/** Wildberries `supplierStatus`: what the SELLER did, WB's own table. */
const WB_SUPPLIER: Record<string, OrderStatusKey> = {
  new: "new",
  confirm: "processing",
  complete: "shipped",
  cancel: "cancelled",
  cancel_carrier: "cancelled",
};

const OZON: Record<string, OrderStatusKey> = {
  awaiting_registration: "new",
  awaiting_verification: "new",
  awaiting_approve: "new",
  awaiting_packaging: "new",
  acceptance_in_progress: "processing",
  awaiting_deliver: "processing",
  delivering: "shipped",
  driver_pickup: "shipped",
  sent_by_seller: "shipped",
  delivered: "delivered",
  cancelled: "cancelled",
  not_accepted: "cancelled",
  arbitration: "returned",
  client_arbitration: "returned",
};

/** Medusa's own order statuses, for the shop half of the same feed. */
const SHOP: Record<string, OrderStatusKey> = {
  pending: "new",
  requires_action: "new",
  completed: "delivered",
  canceled: "cancelled",
  draft: "new",
  archived: "other",
};

/**
 * `null` in, `other` out — not `new`. An order whose status the marketplace
 * did not send is not a new order, and saying so would put a value where an
 * absence is (rule 20a).
 */
export const statusKeyOf = (
  source: string,
  status: string | null,
  statusDetail: string | null,
): OrderStatusKey => {
  const main = status ? status.trim().toLowerCase() : null;
  const detail = statusDetail ? statusDetail.trim().toLowerCase() : null;

  if (source === "wb") {
    if (detail && WB_TERMINAL[detail]) {
      return WB_TERMINAL[detail];
    }
    if (main && WB_SUPPLIER[main]) {
      return WB_SUPPLIER[main];
    }
    if (detail && WB_PROGRESS[detail]) {
      return WB_PROGRESS[detail];
    }
    /** The statistics method sends no status at all and flags cancellation instead. */
    if (main === "cancelled") {
      return "cancelled";
    }
    return "other";
  }

  if (source === "ozon") {
    return (main && OZON[main]) || "other";
  }

  return (main && SHOP[main]) || "other";
};
