import { buyerOrderStatus, type BuyerStatusOrder } from "./buyer-order-status"
import { getOrderPickupPoint } from "./fulfillment"
import type { StatusTone } from "./order-status"
import { isNoDeliveryLine, type NoDeliveryLineInput } from "./shipping-address"

/**
 * The ONE status of an order, the same words for the buyer and the shop owner
 * (t-2026-10-14-58, step C; Ivan 14.10: «статусы заказа "ожидает оплаты"
 * "собирается" "ожидает отправки" "отправлен" "в пути" и тд»). It replaces the
 * pair of Medusa statuses the order page used to show side by side, «Оплачен» +
 * «Отправлен», which contradicted the heading and the delivery block.
 *
 * The chain: awaitingPayment (or the manual transfer's awaitingConfirmation /
 * receiptRejected) → packing → awaitingShipment → shipped → inTransit →
 * atPickupPoint | withCourier → received. Side exits: canceled, returning,
 * returned. An order of online courses only: awaitingPayment → accessOpen.
 *
 * Every stage is read off fields the order already has (rule 17a): the payment
 * status and receipt (`buyerOrderStatus`), the fulfillments' `shipped_at` /
 * `delivered_at` / `canceled_at`, and the carrier status the backend records in
 * the fulfillment's `data` — `cdek_status` from the direct СДЭК webhook,
 * `apiship_status` from the ApiShip sync. A carrier that reports nothing (direct
 * Почта, a number the owner typed) stops at «shipped» until the owner marks the
 * parcel delivered.
 *
 * The panel keeps its own copy of this mapping (`apps/tenant-panel/src/lib/order-stage.ts`):
 * the two apps share no package, and both copies pin the same table in tests.
 */
export type OrderStage =
  | "awaitingPayment"
  | "awaitingConfirmation"
  | "receiptRejected"
  | "packing"
  | "awaitingShipment"
  | "shipped"
  | "inTransit"
  | "atPickupPoint"
  | "withCourier"
  | "received"
  | "accessOpen"
  | "canceled"
  | "returning"
  | "returned"

export const ORDER_STAGES: OrderStage[] = [
  "awaitingPayment",
  "awaitingConfirmation",
  "receiptRejected",
  "packing",
  "awaitingShipment",
  "shipped",
  "inTransit",
  "atPickupPoint",
  "withCourier",
  "received",
  "accessOpen",
  "canceled",
  "returning",
  "returned",
]

/**
 * Orange while the money is awaited, blue while the order is in the shop's
 * hands, purple once a carrier has it, green when it is done, red when it
 * needs someone's attention, neutral when it is over without a delivery.
 */
export const ORDER_STAGE_TONES: Record<OrderStage, StatusTone> = {
  awaitingPayment: "orange",
  awaitingConfirmation: "orange",
  receiptRejected: "red",
  packing: "blue",
  awaitingShipment: "blue",
  shipped: "purple",
  inTransit: "purple",
  atPickupPoint: "purple",
  withCourier: "purple",
  received: "green",
  accessOpen: "green",
  canceled: "red",
  returning: "red",
  returned: "neutral",
}

const PAYMENT_STAGES: OrderStage[] = ["awaitingPayment", "awaitingConfirmation", "receiptRejected"]
const SIDE_EXITS: OrderStage[] = ["canceled", "returning", "returned"]

/** A parcel's place on the road; the two last-mile stages share a rank. */
type ParcelStage = "awaitingShipment" | "shipped" | "inTransit" | "atPickupPoint" | "withCourier" | "received"
type CarrierStage = ParcelStage | "returning" | "returned"

const RANK: Record<ParcelStage, number> = {
  awaitingShipment: 1,
  shipped: 2,
  inTransit: 3,
  atPickupPoint: 4,
  withCourier: 4,
  received: 5,
}

/**
 * Direct СДЭК: the codes of its ORDER_STATUS webhook (`apps/backend/src/cdek/statuses.ts`
 * keeps the same codes and their Russian words). A code not named here says
 * nothing about the stage, and the fulfillment's own dates decide.
 */
export const CDEK_STAGES: Record<string, CarrierStage> = {
  ACCEPTED: "awaitingShipment",
  CREATED: "awaitingShipment",
  INVALID: "awaitingShipment",
  RECEIVED_AT_SHIPMENT_WAREHOUSE: "shipped",
  ACCEPTED_AT_SHIPMENT_WAREHOUSE: "shipped",
  ACCEPTED_AT_SENDER_WAREHOUSE: "shipped",
  READY_FOR_SHIPMENT_IN_SENDER_CITY: "shipped",
  READY_TO_SHIP_AT_SENDING_OFFICE: "shipped",
  TAKEN_BY_TRANSPORTER_FROM_SENDER_CITY: "inTransit",
  SENT_TO_TRANSIT_CITY: "inTransit",
  ACCEPTED_AT_TRANSIT_WAREHOUSE: "inTransit",
  SENT_TO_RECIPIENT_CITY: "inTransit",
  ACCEPTED_AT_DELIVERY_WAREHOUSE: "inTransit",
  IN_CUSTOMS_LOCAL: "inTransit",
  ACCEPTED_AT_PICK_UP_POINT: "atPickupPoint",
  POSTOMAT_POSTED: "atPickupPoint",
  TAKEN_BY_COURIER: "withCourier",
  DELIVERED: "received",
  POSTOMAT_RECEIVED: "received",
  RECEIVED_AT_SHIPMENT_WAREHOUSE_DELIVERED: "received",
  NOT_DELIVERED: "returning",
  RETURNED_TO_SENDER_CITY_WAREHOUSE: "returning",
  RETURNED_TO_TRANSIT_WAREHOUSE: "returning",
  RETURNED_TO_SENDER: "returned",
}

/**
 * ApiShip: its own status keys, one vocabulary for every carrier it connects
 * (`apps/backend/src/apiship/statuses.ts`). `problem`, `lost`, `notApplicable`
 * and `unknown` are left to the dates: the owner sees them on the shipment, the
 * buyer keeps the last step the parcel reached. `deliveryCanceled` means the
 * carrier will not take it, so the parcel waits for the shop again.
 */
export const APISHIP_STAGES: Record<string, CarrierStage> = {
  pending: "awaitingShipment",
  uploading: "awaitingShipment",
  uploaded: "awaitingShipment",
  uploadingError: "awaitingShipment",
  deliveryCanceled: "awaitingShipment",
  onPointIn: "shipped",
  onWay: "inTransit",
  onPointOut: "inTransit",
  readyForRecipient: "atPickupPoint",
  delivering: "withCourier",
  delivered: "received",
  partialReturn: "received",
  returnReady: "returning",
  returning: "returning",
  returned: "returned",
  returnedFromDelivery: "returned",
}

type Dated = string | Date | null | undefined

export type StageFulfillment = {
  packed_at?: Dated
  shipped_at?: Dated
  delivered_at?: Dated
  canceled_at?: Dated
  data?: unknown
}

export type StageOrder = BuyerStatusOrder & {
  fulfillment_status?: string | null
  items?: NoDeliveryLineInput[] | null
  /** `undefined` when the query did not load them: `fulfillment_status` decides then. */
  fulfillments?: (StageFulfillment | null)[] | null
  shipping_methods?: ({ data?: unknown } | null)[] | null
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {}

/** The stage the carrier's last status means, or `null` when it means none. */
export const carrierStageOf = (data: unknown): CarrierStage | null => {
  const d = record(data)
  if (typeof d.apiship_status === "string" && d.apiship_status) {
    return APISHIP_STAGES[d.apiship_status] ?? null
  }
  if (typeof d.cdek_status === "string" && d.cdek_status) {
    return CDEK_STAGES[d.cdek_status.toUpperCase()] ?? null
  }
  return null
}

/** One parcel: its dates, then the carrier's word when that is further along. */
const fulfillmentStage = (fulfillment: StageFulfillment, ownPickup: boolean): CarrierStage => {
  if (fulfillment.delivered_at) return "received"
  const carrier = carrierStageOf(fulfillment.data)
  if (carrier === "returning" || carrier === "returned") return carrier
  const byDates: ParcelStage = fulfillment.shipped_at
    ? "shipped"
    : ownPickup
      ? "atPickupPoint"
      : "awaitingShipment"
  return carrier && RANK[carrier] > RANK[byDates] ? carrier : byDates
}

/** Medusa's own summary, for a query that did not load the fulfillments. */
const byFulfillmentStatus = (status: string | null | undefined, ownPickup: boolean): CarrierStage | null => {
  switch (status) {
    case "fulfilled":
      return ownPickup ? "atPickupPoint" : "awaitingShipment"
    case "partially_shipped":
    case "shipped":
    case "partially_delivered":
      return "shipped"
    case "delivered":
      return "received"
    default:
      return null
  }
}

/**
 * Where the order's parcels stand, `null` while nothing is packed. Several
 * parcels: a returning one speaks for the order, otherwise the one furthest
 * behind does — the order is not «received» until every parcel is.
 */
const parcelStage = (order: StageOrder, ownPickup: boolean): CarrierStage | null => {
  if (order.fulfillments === undefined) {
    return byFulfillmentStatus(order.fulfillment_status, ownPickup)
  }
  const active = (order.fulfillments ?? []).filter(
    (f): f is StageFulfillment => Boolean(f) && !f?.canceled_at
  )
  if (!active.length) return null
  // Some lines are packed and the rest are not: the shop is still packing.
  if (order.fulfillment_status === "partially_fulfilled") return null
  const stages = active.map((f) => fulfillmentStage(f, ownPickup))
  const exit = stages.find((s) => s === "returning") ?? stages.find((s) => s === "returned")
  if (exit) return exit
  return (stages as ParcelStage[]).reduce((a, b) => (RANK[b] < RANK[a] ? b : a))
}

/** Every line is sold without delivery (an online course). An order with no lines loaded is a parcel. */
export const isCourseOnlyOrder = (order: Pick<StageOrder, "items">): boolean =>
  Boolean(order.items?.length) && (order.items ?? []).every((item) => isNoDeliveryLine(item))

export const orderStage = (order: StageOrder): OrderStage => {
  if (order.status === "canceled") return "canceled"
  if (order.payment_status === "refunded") return "returned"

  const ownPickup = Boolean(getOrderPickupPoint(order))
  const parcel = isCourseOnlyOrder(order) ? null : parcelStage(order, ownPickup)

  // A parcel the carrier already has outranks the payment: the buyer needs to
  // know where it is, and the payment keeps its own line in «Оплата».
  if (parcel && (parcel === "returning" || parcel === "returned" || RANK[parcel] >= RANK.shipped)) {
    return parcel
  }

  const payment = buyerOrderStatus(order)
  if (payment === "awaitingPayment" || payment === "awaitingConfirmation" || payment === "receiptRejected") {
    return payment
  }

  if (isCourseOnlyOrder(order)) return "accessOpen"
  return parcel ?? "packing"
}

export type OrderDelivery = {
  /** `course`: nothing to post. `pickup`: the shop's own point. `tracked`: the carrier reports statuses. */
  kind: "course" | "pickup" | "tracked" | "untracked"
  carrier: "cdek" | "apiship" | "pochta" | null
  /** The parcel ends at a pickup point (step 6 is «Ждёт в пункте выдачи», not «Передан курьеру»). */
  toPoint: boolean
}

const methodData = (order: StageOrder): Record<string, unknown> => {
  const method = (order.shipping_methods ?? []).find((sm) => {
    const provider = record(sm?.data).provider
    return typeof provider === "string" && provider.length > 0
  })
  return record(method?.data)
}

export const orderDelivery = (order: StageOrder): OrderDelivery => {
  if (isCourseOnlyOrder(order)) return { kind: "course", carrier: null, toPoint: false }
  if (getOrderPickupPoint(order)) return { kind: "pickup", carrier: null, toPoint: true }

  const data = methodData(order)
  const fulfillmentData = (order.fulfillments ?? []).map((f) => record(f?.data))
  const provider = typeof data.provider === "string" ? data.provider : null
  const carrier: OrderDelivery["carrier"] =
    provider === "apiship" || fulfillmentData.some((d) => d.provider === "apiship" || "apiship_status" in d)
      ? "apiship"
      : provider === "cdek" || fulfillmentData.some((d) => "cdek_order_uuid" in d || "cdek_status" in d)
        ? "cdek"
        : provider === "pochta"
          ? "pochta"
          : null
  const toPoint =
    typeof data.apiship_point_id === "number" ||
    (typeof data.cdek_point_code === "string" && data.cdek_point_code.length > 0) ||
    Boolean(data.pochta_point_index ?? data.pochta_point_address)

  return {
    kind: carrier === "cdek" || carrier === "apiship" ? "tracked" : "untracked",
    carrier,
    toPoint,
  }
}

/**
 * The steps of THIS order's road, for the progress bar: seven with a carrier
 * that reports statuses, five without one (no «В пути», no last mile), four for
 * the shop's own pickup point, two for a course. Step one is named by the
 * payment stage the order is in. A side exit has no road: `[]`.
 */
export const orderStagePath = (order: StageOrder): OrderStage[] => {
  const stage = orderStage(order)
  if (SIDE_EXITS.includes(stage)) return []

  const pay = PAYMENT_STAGES.includes(stage) ? stage : "awaitingPayment"
  const delivery = orderDelivery(order)

  switch (delivery.kind) {
    case "course":
      return [pay, "accessOpen"]
    case "pickup":
      return [pay, "packing", "atPickupPoint", "received"]
    case "tracked": {
      const lastMile: OrderStage =
        stage === "withCourier" || stage === "atPickupPoint"
          ? stage
          : delivery.toPoint
            ? "atPickupPoint"
            : "withCourier"
      return [pay, "packing", "awaitingShipment", "shipped", "inTransit", lastMile, "received"]
    }
    default:
      return [pay, "packing", "awaitingShipment", "shipped", "received"]
  }
}

/** The step the order is on (1-based) and the step after it, or `null` off the road. */
export const orderStageProgress = (
  order: StageOrder
): { at: number; total: number; next: OrderStage | null } | null => {
  const path = orderStagePath(order)
  const index = path.indexOf(orderStage(order))
  if (index < 0) return null
  return { at: index + 1, total: path.length, next: path[index + 1] ?? null }
}

/**
 * Which sentence explains the stage: the stage itself, or a variant where the
 * carrier changes what the buyer should do — direct Почта and a number the
 * owner typed report no statuses after «shipped», and a refunded order is
 * «returned» for its money, not for a parcel.
 */
export type OrderStageHint = OrderStage | "shippedPochta" | "shippedNoFeed" | "returnedRefund"

export const orderStageHint = (order: StageOrder): OrderStageHint => {
  const stage = orderStage(order)
  if (stage === "returned" && order.payment_status === "refunded") return "returnedRefund"
  if (stage === "shipped") {
    const delivery = orderDelivery(order)
    if (delivery.carrier === "pochta") return "shippedPochta"
    if (delivery.kind === "untracked") return "shippedNoFeed"
  }
  return stage
}
