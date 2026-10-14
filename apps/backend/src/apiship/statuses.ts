/**
 * ApiShip order statuses and what each one means for a Medusa fulfillment
 * (t-2026-10-14-58).
 *
 * The keys are ApiShip's own `GET /lists/statuses` answer, read from the test
 * contour on 14.10.2026 (19 rows). ApiShip translates every carrier's status
 * vocabulary into these keys, so one map serves СДЭК, Почта России and any
 * other carrier the cabinet connects. The carrier's own code and text come
 * along in `providerCode` / `providerName` and are kept verbatim in the
 * fulfillment's `data.apiship_statuses`, nothing is lost.
 */

export type ApishipStatusEntry = {
  key: string;
  at: string;
  name?: string | null;
  provider_code?: string | null;
  provider_name?: string | null;
  error_code?: string | null;
};

/** The parcel is in the carrier's hands: the fulfillment counts as shipped. */
export const APISHIP_SHIPPED_STATUSES = new Set([
  "onPointIn",
  "onWay",
  "onPointOut",
  "readyForRecipient",
  "delivering",
  "delivered",
  "partialReturn",
]);

/** The end of the road. */
export const APISHIP_DELIVERED_STATUSES = new Set(["delivered"]);

/** Something the owner has to look at: the upload failed, the parcel is lost or stuck. */
export const APISHIP_PROBLEM_STATUSES = new Set(["uploadingError", "problem", "lost"]);

/** The parcel is coming back, or was cancelled by the carrier. */
export const APISHIP_RETURN_STATUSES = new Set([
  "returning",
  "returned",
  "returnedFromDelivery",
  "returnReady",
  "deliveryCanceled",
]);

/** Statuses after which polling stops: nothing further will come. */
export const APISHIP_FINAL_STATUSES = new Set([
  "delivered",
  "returned",
  "returnedFromDelivery",
  "deliveryCanceled",
  "lost",
]);

/** Plain Russian for the panel and the buyer's order page. */
export const APISHIP_STATUS_LABELS: Record<string, string> = {
  pending: "Передаётся перевозчику",
  uploading: "Передаётся перевозчику",
  uploaded: "Принят перевозчиком",
  uploadingError: "Перевозчик не принял заказ",
  onPointIn: "Принят на склад отправления",
  onWay: "В пути",
  onPointOut: "Прибыл в город получателя",
  readyForRecipient: "Готов к выдаче",
  delivering: "Передан курьеру на доставку",
  delivered: "Вручён получателю",
  partialReturn: "Частичный возврат",
  returnReady: "Подготовлен возврат",
  returning: "Возвращается отправителю",
  returned: "Возвращён отправителю",
  returnedFromDelivery: "Возвращён с доставки",
  deliveryCanceled: "Доставка отменена",
  problem: "Возникла проблема",
  lost: "Утерян",
  notApplicable: "Статус не применим",
  unknown: "Статус неизвестен",
};

export const apishipStatusLabel = (key: string | null | undefined): string => {
  if (!key) return "Статус неизвестен";
  return APISHIP_STATUS_LABELS[key] ?? key;
};

/**
 * The public tracking page for a carrier's own number. ApiShip answers a
 * `trackingUrl` for most carriers; when it does not, the two carriers this task
 * names get their own, and any other carrier gets `null` rather than a guess.
 */
export const apishipTrackingUrl = (
  providerKey: string | null | undefined,
  providerNumber: string | null | undefined,
  trackingUrl?: string | null,
): string | null => {
  if (trackingUrl && /^https?:\/\//.test(trackingUrl)) return trackingUrl;
  const number = (providerNumber ?? "").trim();
  if (!number) return null;
  switch (providerKey) {
    case "cdek":
      return `https://www.cdek.ru/ru/tracking?order_id=${encodeURIComponent(number)}`;
    case "rupost":
      return `https://www.pochta.ru/tracking#${encodeURIComponent(number)}`;
    default:
      return null;
  }
};
