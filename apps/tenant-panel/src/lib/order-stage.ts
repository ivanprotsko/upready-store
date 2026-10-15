// t-2026-10-14-58, step C: the ONE status of an order, in the words the buyer
// reads on the storefront (Ivan 14.10: «статусы заказа "ожидает оплаты"
// "собирается" "ожидает отправки" "отправлен" "в пути" и тд»). It replaces the
// list's «Сборка» column and the card's fulfillment badge, Medusa's
// «Ждёт сборки» / «Собран» / «Отправлен частично»; the «Оплата» column stays.
//
// The storefront keeps its own copy (`apps/storefront/src/lib/util/order-stage.ts`):
// the two apps share no package, and both pin the same table in tests. Change
// one, change the other.
//
// The chain: awaitingPayment (or the manual transfer's awaitingConfirmation /
// receiptRejected) → packing → awaitingShipment → shipped → inTransit →
// atPickupPoint | withCourier → received. Side exits: canceled, returning,
// returned. An order of online courses only: awaitingPayment → accessOpen.
// Everything is read off fields the order has: the payment status and the
// receipt, the fulfillments' dates, and the carrier status the backend keeps
// in the fulfillment's `data` (`cdek_status`, `apiship_status`).

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

export type StageColor = "green" | "red" | "orange" | "blue" | "purple" | "grey"

/**
 * Orange while the money is awaited, blue while the order waits for the owner
 * (pack it, hand it over), purple once a carrier has it, green when it is done,
 * red when it needs attention, grey when it is over without a delivery.
 */
export const ORDER_STAGE_COLORS: Record<OrderStage, StageColor> = {
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
  returned: "grey",
}

/** The i18n key of a stage's word, the same word the buyer reads. */
export const orderStageKey = (stage: OrderStage): string => `orders.stage.${stage}`

/** Medusa's payment statuses that say only «the money has not come yet». */
const NOT_PAID_YET = ["not_paid", "awaiting"]

/**
 * t-2026-10-14-58 (release stand 14.10, lead 15.10): the card header drops the
 * payment badge when it means what the stage already says, «Ожидает оплаты»
 * twice or «Ожидает оплаты» next to a gateway's «Ждёт оплаты». Compared by
 * meaning, not by words. The manual transfer's badge is a stage of its own
 * (`manualPaymentStatus().stage`); any other payment repeats only
 * «Ожидает оплаты», and only while it is not paid yet. A badge that tells more
 * stays: «Оплачен» next to «Собирается», «Нужно ваше действие», «Ждёт оплаты»
 * next to «Отправлен».
 */
export const paymentRepeatsStage = (
  stage: OrderStage,
  paymentStatus: string | null | undefined,
  manualStage?: OrderStage | null
): boolean =>
  manualStage
    ? manualStage === stage
    : stage === "awaitingPayment" && NOT_PAID_YET.includes(paymentStatus ?? "")

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

/** Direct СДЭК: the codes of its webhook (`apps/backend/src/cdek/statuses.ts`). */
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
 * ApiShip: its own status keys (`apps/backend/src/apiship/statuses.ts`).
 * `problem`, `lost`, `notApplicable` and `unknown` are left to the dates: the
 * shipment card shows them to the owner in red.
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

export type StageOrder = {
  status?: string | null
  payment_status?: string | null
  fulfillment_status?: string | null
  metadata?: Record<string, unknown> | null
  items?: { requires_shipping?: boolean | null }[] | null
  /** `undefined` when the query did not load them: `fulfillment_status` decides then. */
  fulfillments?: (StageFulfillment | null)[] | null
  payment_collections?:
    | ({
        payments?: ({ provider_id?: string | null; canceled_at?: unknown } | null)[] | null
        payment_sessions?: ({ provider_id?: string | null; status?: string | null } | null)[] | null
      } | null)[]
    | null
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {}

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

const parcelStage = (order: StageOrder, ownPickup: boolean): CarrierStage | null => {
  if (order.fulfillments === undefined) {
    return byFulfillmentStatus(order.fulfillment_status, ownPickup)
  }
  const active = (order.fulfillments ?? []).filter(
    (f): f is StageFulfillment => Boolean(f) && !f?.canceled_at
  )
  if (!active.length) return null
  if (order.fulfillment_status === "partially_fulfilled") return null
  const stages = active.map((f) => fulfillmentStage(f, ownPickup))
  const exit = stages.find((s) => s === "returning") ?? stages.find((s) => s === "returned")
  if (exit) return exit
  return (stages as ParcelStage[]).reduce((a, b) => (RANK[b] < RANK[a] ? b : a))
}

/** The shop's own pickup point the checkout wrote on the order (storefront `PICKUP_METADATA_KEYS`). */
const isOwnPickup = (order: StageOrder): boolean => {
  const id = order.metadata?.pickup_point_id
  const name = order.metadata?.pickup_point_name
  return typeof id === "string" && id.length > 0 && typeof name === "string" && name.length > 0
}

/** Every line sold without delivery (an online course); lines not loaded count as a parcel. */
export const isCourseOnly = (order: StageOrder): boolean =>
  Boolean(order.items?.length) && (order.items ?? []).every((item) => item.requires_shipping === false)

const CAPTURED = ["captured", "partially_captured", "partially_refunded"]

const isRobokassa = (providerId: string | null | undefined) => Boolean(providerId?.startsWith("pp_robokassa_"))

/**
 * Where the money stands, the storefront's `buyerOrderStatus` in short: a
 * captured payment or an existing Robokassa payment is paid; a Robokassa order
 * placed before Robokassa's confirmation arrived (a `pending_authorization`
 * session, no payment) is being confirmed; otherwise the receipt decides
 * between «Ожидает оплаты», «Ожидает подтверждения оплаты» and «Чек не принят».
 */
const paymentStage = (order: StageOrder): "paid" | "awaitingPayment" | "awaitingConfirmation" | "receiptRejected" => {
  if (CAPTURED.includes(order.payment_status ?? "")) return "paid"
  const collections = (order.payment_collections ?? []).filter(Boolean)
  const payments = collections.flatMap((collection) => collection?.payments ?? [])
  if (payments.some((payment) => isRobokassa(payment?.provider_id) && !payment?.canceled_at)) return "paid"
  const confirming =
    !payments.length &&
    collections.some((collection) =>
      (collection?.payment_sessions ?? []).some(
        (session) => isRobokassa(session?.provider_id) && session?.status === "pending_authorization"
      )
    )
  if (confirming) return "awaitingConfirmation"
  const receipt = order.metadata?.payment_receipt
  if (receipt && typeof receipt === "object") {
    return (receipt as { status?: unknown }).status === "rejected" ? "receiptRejected" : "awaitingConfirmation"
  }
  return "awaitingPayment"
}

export const orderStage = (order: StageOrder): OrderStage => {
  if (order.status === "canceled") return "canceled"
  if (order.payment_status === "refunded") return "returned"

  const parcel = isCourseOnly(order) ? null : parcelStage(order, isOwnPickup(order))

  // A parcel the carrier already has outranks the payment; «Оплата» keeps its own column.
  if (parcel && (parcel === "returning" || parcel === "returned" || RANK[parcel] >= RANK.shipped)) {
    return parcel
  }

  const payment = paymentStage(order)
  if (payment !== "paid") return payment

  if (isCourseOnly(order)) return "accessOpen"
  return parcel ?? "packing"
}
