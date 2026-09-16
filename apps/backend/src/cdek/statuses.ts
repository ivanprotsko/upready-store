/**
 * CDEK order statuses, and which of them move a Medusa fulfillment
 * (i02-apiship-cdek-shipping).
 *
 * CDEK's status vocabulary is a long list of waypoints («принят на склад
 * отправителя», «выдан на доставку»); a shop owner cares about three moments,
 * and Medusa records two of them as columns on the fulfillment. Everything else
 * is kept verbatim in `data.cdek_statuses` so nothing is lost.
 */

export type CdekStatusEntry = {
  code: string;
  at: string;
  raw?: Record<string, unknown>;
};

/** Once the parcel is moving, the fulfillment counts as shipped. */
export const CDEK_SHIPPED_STATUSES = new Set([
  "ACCEPTED_AT_SHIPMENT_WAREHOUSE",
  "RECEIVED_AT_SHIPMENT_WAREHOUSE",
  "ACCEPTED_AT_SENDER_WAREHOUSE",
  "TAKEN_BY_TRANSPORTER_FROM_SENDER_CITY",
  "SENT_TO_TRANSIT_CITY",
  "SENT_TO_RECIPIENT_CITY",
  "IN_CUSTOMS_LOCAL",
]);

/** The end of the road. */
export const CDEK_DELIVERED_STATUSES = new Set(["DELIVERED", "RECEIVED_AT_SHIPMENT_WAREHOUSE_DELIVERED"]);

/** Plain Russian for the panel and for a customer-facing order page. */
export const CDEK_STATUS_LABELS: Record<string, string> = {
  ACCEPTED: "Заказ создан",
  CREATED: "Заказ создан",
  ACCEPTED_AT_SHIPMENT_WAREHOUSE: "Принят на склад отправителя",
  ACCEPTED_AT_SENDER_WAREHOUSE: "Принят на склад отправителя",
  RECEIVED_AT_SHIPMENT_WAREHOUSE: "Принят на склад отправителя",
  TAKEN_BY_TRANSPORTER_FROM_SENDER_CITY: "Забран курьером",
  SENT_TO_TRANSIT_CITY: "В пути",
  SENT_TO_RECIPIENT_CITY: "В пути",
  ACCEPTED_AT_DELIVERY_WAREHOUSE: "Прибыл в город получателя",
  ACCEPTED_AT_TRANSIT_WAREHOUSE: "В пути",
  TAKEN_BY_COURIER: "Передан курьеру на доставку",
  READY_FOR_SHIPMENT_IN_SENDER_CITY: "Готов к отправке",
  READY_TO_SHIP_AT_SENDING_OFFICE: "Готов к отправке",
  DELIVERED: "Вручён получателю",
  NOT_DELIVERED: "Не вручён",
  RETURNED_TO_SENDER: "Возвращён отправителю",
  INVALID: "Ошибка на стороне СДЭК",
};

export const cdekStatusLabel = (code: string | null | undefined): string => {
  if (!code) return "Статус неизвестен";
  return CDEK_STATUS_LABELS[code.toUpperCase()] ?? code;
};

/** The public tracking page a buyer can open with the CDEK number. */
export const cdekTrackingUrl = (cdekNumber: string | null | undefined): string | null =>
  cdekNumber ? `https://www.cdek.ru/ru/tracking?order_id=${encodeURIComponent(cdekNumber)}` : null;
