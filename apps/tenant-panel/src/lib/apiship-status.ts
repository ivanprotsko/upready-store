// t-2026-10-14-58, part B: the ApiShip status of a shipment, the way the
// backend's `src/apiship/statuses.ts` reads it. The words live in one key map,
// `apishipShipment.status.<key>` in ru.json / en.json; the colour comes from
// the stage: blue until the carrier's warehouse takes the parcel, green from
// there on, red when the carrier refused or lost it, orange on the way back.

export const APISHIP_STATUS_KEYS = [
  "pending",
  "uploading",
  "uploaded",
  "uploadingError",
  "onPointIn",
  "onWay",
  "onPointOut",
  "readyForRecipient",
  "delivering",
  "delivered",
  "partialReturn",
  "returnReady",
  "returning",
  "returned",
  "returnedFromDelivery",
  "deliveryCanceled",
  "problem",
  "lost",
  "notApplicable",
  "unknown",
] as const

export type ApishipStatusColor = "blue" | "green" | "red" | "orange" | "grey"

const BLUE = new Set(["pending", "uploading", "uploaded"])
const GREEN = new Set(["onPointIn", "onWay", "onPointOut", "readyForRecipient", "delivering", "delivered"])
const RED = new Set(["uploadingError", "problem", "lost"])
const ORANGE = new Set([
  "partialReturn",
  "returnReady",
  "returning",
  "returned",
  "returnedFromDelivery",
  "deliveryCanceled",
])

export const apishipStatusColor = (key: string | null | undefined): ApishipStatusColor => {
  if (!key) return "grey"
  if (BLUE.has(key)) return "blue"
  if (GREEN.has(key)) return "green"
  if (RED.has(key)) return "red"
  if (ORANGE.has(key)) return "orange"
  return "grey"
}

/** The i18n key of a status; a key the panel does not know reads «Статус неизвестен». */
export const apishipStatusKey = (key: string | null | undefined): string =>
  key && (APISHIP_STATUS_KEYS as readonly string[]).includes(key)
    ? `apishipShipment.status.${key}`
    : "apishipShipment.status.unknown"

export const APISHIP_PROVIDER_ID = "apiship_apiship"

type FulfillmentLike = {
  provider_id?: string | null
  data?: Record<string, unknown> | null
}

/** A fulfillment shipped through ApiShip (contract section 2). */
export const isApishipFulfillment = (fulfillment: FulfillmentLike): boolean =>
  fulfillment.provider_id === APISHIP_PROVIDER_ID || fulfillment.data?.provider === "apiship"

/**
 * ApiShip's «Заказ не был передан в СД» means the carrier has not taken the
 * order yet: said in the owner's words, with what to do.
 */
export const isNotYetWithCarrier = (message: string): boolean => /не был передан в СД/i.test(message)
