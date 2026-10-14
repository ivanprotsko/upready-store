import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import {
  APISHIP_STAGES,
  CDEK_STAGES,
  ORDER_STAGES,
  ORDER_STAGE_TONES,
  orderDelivery,
  orderStage,
  orderStageHint,
  orderStagePath,
  orderStageProgress,
  type OrderStage,
  type StageOrder,
} from "./order-stage"

/**
 * The whole chain of t-2026-10-14-58 step C, one row per case: what the order
 * carries → the one stage the buyer and the owner read. The panel's copy
 * (`apps/tenant-panel/src/lib/order-stage.ts`) pins the same rows.
 */

const paid = { status: "pending", payment_status: "captured", metadata: null }
const parcel = [{ requires_shipping: true }]
const course = [{ requires_shipping: false }]

const order = (over: Partial<StageOrder> = {}): StageOrder =>
  ({ ...paid, items: parcel, fulfillments: [], shipping_methods: [], ...over }) as StageOrder

const cdekMethod = [{ data: { provider: "cdek", cdek_point_code: "MSK123" } }]
const cdekDoor = [{ data: { provider: "cdek" } }]
const apishipPoint = [{ data: { provider: "apiship", apiship_point_id: 42 } }]
const pochtaMethod = [{ data: { provider: "pochta", pochta_point_index: "129345" } }]

const cdek = (code: string, over: Record<string, unknown> = {}) =>
  order({ shipping_methods: cdekMethod, fulfillments: [{ data: { cdek_order_uuid: "u1", cdek_status: code }, ...over }] })
const apiship = (key: string, over: Record<string, unknown> = {}) =>
  order({ shipping_methods: apishipPoint, fulfillments: [{ data: { provider: "apiship", apiship_status: key }, ...over }] })

const ROWS: [string, StageOrder, OrderStage][] = [
  // payment
  ["manual transfer, no receipt", order({ payment_status: "not_paid" }), "awaitingPayment"],
  ["manual transfer, receipt sent", order({ payment_status: "not_paid", metadata: { payment_receipt: { file_url: "/r.jpg", sent_at: "2026-10-14" } } }), "awaitingConfirmation"],
  ["manual transfer, receipt rejected", order({ payment_status: "not_paid", metadata: { payment_receipt: { file_url: "/r.jpg", status: "rejected" } } }), "receiptRejected"],
  ["authorized, nothing captured", order({ payment_status: "authorized" }), "awaitingPayment"],
  // BTCPay, Bitcart and Tribute place an order only once their session reads
  // `captured`, and Medusa captures the payment right there: paid, the same in
  // the panel (`order-stage.test.mjs`).
  ["BTCPay: settled, captured at checkout", order({ payment_collections: [{ id: "pc1", payments: [{ provider_id: "pp_btcpay_btcpay" }] }] }), "packing"],
  ["Bitcart: complete, captured at checkout", order({ payment_collections: [{ id: "pc1", payments: [{ provider_id: "pp_bitcart_bitcart" }] }] }), "packing"],
  ["Tribute: paid, captured at checkout", order({ payment_collections: [{ id: "pc1", payments: [{ provider_id: "pp_tribute_tribute" }] }] }), "packing"],
  ["a BTCPay payment authorized, not captured", order({ payment_status: "authorized", payment_collections: [{ id: "pc1", payments: [{ provider_id: "pp_btcpay_btcpay" }] }] }), "awaitingPayment"],
  // the shop's hands
  ["paid, nothing fulfilled", order(), "packing"],
  ["paid, the only fulfillment cancelled", order({ fulfillments: [{ canceled_at: "2026-10-14" }] }), "packing"],
  ["paid, part of the lines packed", order({ fulfillment_status: "partially_fulfilled", fulfillments: [{}] }), "packing"],
  ["paid, packed, no carrier status", order({ fulfillments: [{ packed_at: "2026-10-14" }] }), "awaitingShipment"],
  // direct СДЭК
  ["СДЭК: order created", cdek("CREATED"), "awaitingShipment"],
  ["СДЭК: accepted", cdek("ACCEPTED"), "awaitingShipment"],
  ["СДЭК: at the sender warehouse", cdek("ACCEPTED_AT_SHIPMENT_WAREHOUSE", { shipped_at: "2026-10-14" }), "shipped"],
  ["СДЭК: taken from the sender city", cdek("TAKEN_BY_TRANSPORTER_FROM_SENDER_CITY"), "inTransit"],
  ["СДЭК: sent to the recipient city", cdek("SENT_TO_RECIPIENT_CITY"), "inTransit"],
  ["СДЭК: arrived in the recipient city", cdek("ACCEPTED_AT_DELIVERY_WAREHOUSE"), "inTransit"],
  ["СДЭК: at the pickup point", cdek("ACCEPTED_AT_PICK_UP_POINT"), "atPickupPoint"],
  ["СДЭК: in the parcel locker", cdek("POSTOMAT_POSTED"), "atPickupPoint"],
  ["СДЭК: with the courier", cdek("TAKEN_BY_COURIER"), "withCourier"],
  ["СДЭК: delivered", cdek("DELIVERED", { delivered_at: "2026-10-16" }), "received"],
  ["СДЭК: lower-case code", cdek("sent_to_recipient_city"), "inTransit"],
  ["СДЭК: a code not mapped keeps the dates", cdek("SOME_NEW_CODE", { shipped_at: "2026-10-14" }), "shipped"],
  ["СДЭК: not delivered", cdek("NOT_DELIVERED"), "returning"],
  ["СДЭК: returned to the sender", cdek("RETURNED_TO_SENDER"), "returned"],
  // ApiShip
  ["ApiShip: pending", apiship("pending"), "awaitingShipment"],
  ["ApiShip: uploaded", apiship("uploaded"), "awaitingShipment"],
  ["ApiShip: upload failed", apiship("uploadingError"), "awaitingShipment"],
  ["ApiShip: on the sending point", apiship("onPointIn"), "shipped"],
  ["ApiShip: on the way", apiship("onWay"), "inTransit"],
  ["ApiShip: in the recipient city", apiship("onPointOut"), "inTransit"],
  ["ApiShip: ready for the recipient", apiship("readyForRecipient"), "atPickupPoint"],
  ["ApiShip: delivering", apiship("delivering"), "withCourier"],
  ["ApiShip: delivered", apiship("delivered"), "received"],
  ["ApiShip: partial return, the buyer took a part", apiship("partialReturn"), "received"],
  ["ApiShip: problem keeps the dates", apiship("problem", { shipped_at: "2026-10-14" }), "shipped"],
  ["ApiShip: lost keeps the dates", apiship("lost", { shipped_at: "2026-10-14" }), "shipped"],
  ["ApiShip: delivery cancelled before pickup", apiship("deliveryCanceled"), "awaitingShipment"],
  ["ApiShip: returning", apiship("returning"), "returning"],
  ["ApiShip: return ready", apiship("returnReady"), "returning"],
  ["ApiShip: returned", apiship("returned"), "returned"],
  ["ApiShip: returned from delivery", apiship("returnedFromDelivery"), "returned"],
  // no status feed
  ["Почта напрямую: shipped stays shipped", order({ shipping_methods: pochtaMethod, fulfillments: [{ shipped_at: "2026-10-14" }] }), "shipped"],
  ["Почта напрямую: the owner marked it delivered", order({ shipping_methods: pochtaMethod, fulfillments: [{ shipped_at: "2026-10-14", delivered_at: "2026-10-18" }] }), "received"],
  ["the owner shipped by hand with a number", order({ fulfillments: [{ shipped_at: "2026-10-14" }] }), "shipped"],
  ["the owner marked shipped while ApiShip still uploads", apiship("uploaded", { shipped_at: "2026-10-14" }), "shipped"],
  // the shop's own pickup point
  ["own pickup point: packed", order({ metadata: { pickup_point_id: "p1", pickup_point_name: "Магазин" }, fulfillments: [{ packed_at: "2026-10-14" }] }), "atPickupPoint"],
  ["own pickup point: picked up", order({ metadata: { pickup_point_id: "p1", pickup_point_name: "Магазин" }, fulfillments: [{ delivered_at: "2026-10-15" }] }), "received"],
  // several parcels
  ["two parcels: the slower one speaks", order({ fulfillments: [{ delivered_at: "2026-10-16" }, { shipped_at: "2026-10-14" }] }), "shipped"],
  ["two parcels: a returning one speaks", order({ fulfillments: [{ delivered_at: "2026-10-16" }, { data: { cdek_status: "NOT_DELIVERED" } }] }), "returning"],
  // fulfillments not loaded: Medusa's summary
  ["no fulfillments loaded, not fulfilled", order({ fulfillments: undefined, fulfillment_status: "not_fulfilled" }), "packing"],
  ["no fulfillments loaded, fulfilled", order({ fulfillments: undefined, fulfillment_status: "fulfilled" }), "awaitingShipment"],
  ["no fulfillments loaded, shipped", order({ fulfillments: undefined, fulfillment_status: "shipped" }), "shipped"],
  ["no fulfillments loaded, delivered", order({ fulfillments: undefined, fulfillment_status: "delivered" }), "received"],
  // payment against the parcel
  ["not paid yet, but the carrier has the parcel", order({ payment_status: "not_paid", fulfillments: [{ shipped_at: "2026-10-14" }] }), "shipped"],
  ["not paid yet, packed", order({ payment_status: "not_paid", fulfillments: [{ packed_at: "2026-10-14" }] }), "awaitingPayment"],
  // course
  ["course: not paid", order({ items: course, payment_status: "not_paid" }), "awaitingPayment"],
  ["course: paid", order({ items: course }), "accessOpen"],
  ["course + a parcel: the parcel's road", order({ items: [...course, ...parcel] }), "packing"],
  // side exits
  ["cancelled", order({ status: "canceled", fulfillments: [{ shipped_at: "2026-10-14" }] }), "canceled"],
  ["refunded in full", order({ payment_status: "refunded" }), "returned"],
  ["refunded in part, delivered", order({ payment_status: "partially_refunded", fulfillments: [{ delivered_at: "2026-10-16" }] }), "received"],
]

describe("orderStage: the chain, both carriers, the course and the side exits", () => {
  it.each(ROWS)("%s → %s", (_case, input, stage) => {
    expect(orderStage(input)).toBe(stage)
  })

  it("covers every stage at least once", () => {
    const seen = new Set(ROWS.map(([, , stage]) => stage))
    expect(ORDER_STAGES.filter((stage) => !seen.has(stage))).toEqual([])
  })

  it("maps every ApiShip key the backend names, except the four that say nothing", () => {
    const backend = readFileSync(
      path.resolve(__dirname, "../../../../backend/src/apiship/statuses.ts"),
      "utf8"
    )
    const labels = backend.slice(backend.indexOf("APISHIP_STATUS_LABELS"))
    const keys = Array.from(labels.matchAll(/^\s+(\w+): "/gm), (m) => m[1])
    expect(keys.length).toBeGreaterThan(15)
    expect(keys.filter((k) => !(k in APISHIP_STAGES)).sort()).toEqual(
      ["lost", "notApplicable", "problem", "unknown"]
    )
  })

  it("maps every СДЭК code the backend names", () => {
    const backend = readFileSync(
      path.resolve(__dirname, "../../../../backend/src/cdek/statuses.ts"),
      "utf8"
    )
    const labels = backend.slice(backend.indexOf("CDEK_STATUS_LABELS"))
    const codes = Array.from(labels.matchAll(/^\s+([A-Z_]+): "/gm), (m) => m[1])
    expect(codes.length).toBeGreaterThan(10)
    expect(codes.filter((c) => !(c in CDEK_STAGES))).toEqual([])
  })

  it("gives every stage a tone", () => {
    expect(Object.keys(ORDER_STAGE_TONES).sort()).toEqual([...ORDER_STAGES].sort())
  })
})

describe("orderStagePath: the steps of this order's road", () => {
  it("is seven steps with СДЭК to a point", () => {
    expect(orderStagePath(cdek("SENT_TO_RECIPIENT_CITY"))).toEqual([
      "awaitingPayment", "packing", "awaitingShipment", "shipped", "inTransit", "atPickupPoint", "received",
    ])
    expect(orderStageProgress(cdek("SENT_TO_RECIPIENT_CITY"))).toEqual({ at: 5, total: 7, next: "atPickupPoint" })
  })

  it("ends with the courier for a door delivery", () => {
    const door = order({ shipping_methods: cdekDoor, fulfillments: [{ data: { cdek_order_uuid: "u", cdek_status: "SENT_TO_RECIPIENT_CITY" } }] })
    expect(orderStagePath(door)[5]).toBe("withCourier")
    expect(orderStageProgress(door)?.next).toBe("withCourier")
  })

  it("names the last mile the carrier reported, whatever the method said", () => {
    expect(orderStagePath(apiship("delivering"))[5]).toBe("withCourier")
  })

  it("is five steps with Почта: no «В пути», no last mile", () => {
    const pochta = order({ shipping_methods: pochtaMethod, fulfillments: [{ shipped_at: "2026-10-14" }] })
    expect(orderStagePath(pochta)).toEqual(["awaitingPayment", "packing", "awaitingShipment", "shipped", "received"])
    expect(orderStageProgress(pochta)).toEqual({ at: 4, total: 5, next: "received" })
    expect(orderDelivery(pochta)).toEqual({ kind: "untracked", carrier: "pochta", toPoint: true })
  })

  it("is four steps at the shop's own point", () => {
    const own = order({ metadata: { pickup_point_id: "p1", pickup_point_name: "Магазин" } })
    expect(orderStagePath(own)).toEqual(["awaitingPayment", "packing", "atPickupPoint", "received"])
  })

  it("is two steps for a course", () => {
    expect(orderStagePath(order({ items: course }))).toEqual(["awaitingPayment", "accessOpen"])
    expect(orderStageProgress(order({ items: course }))).toEqual({ at: 2, total: 2, next: null })
  })

  it("names step one by the payment stage the order is in", () => {
    const sent = order({ payment_status: "not_paid", metadata: { payment_receipt: { file_url: "/r.jpg" } } })
    expect(orderStagePath(sent)[0]).toBe("awaitingConfirmation")
    expect(orderStageProgress(sent)).toMatchObject({ at: 1, next: "packing" })
  })

  it("has no road for a side exit", () => {
    expect(orderStagePath(order({ status: "canceled" }))).toEqual([])
    expect(orderStageProgress(cdek("NOT_DELIVERED"))).toBeNull()
  })

  it("knows the carrier from the fulfillment when the method does not say", () => {
    const bare = order({ fulfillments: [{ data: { cdek_order_uuid: "u", cdek_status: "CREATED" } }] })
    expect(orderDelivery(bare)).toMatchObject({ kind: "tracked", carrier: "cdek" })
  })
})

describe("orderStageHint", () => {
  it("tells a Почта buyer there will be no statuses", () => {
    expect(orderStageHint(order({ shipping_methods: pochtaMethod, fulfillments: [{ shipped_at: "2026-10-14" }] }))).toBe("shippedPochta")
  })

  it("tells the same for a number the owner typed", () => {
    expect(orderStageHint(order({ fulfillments: [{ shipped_at: "2026-10-14" }] }))).toBe("shippedNoFeed")
  })

  it("keeps the plain «shipped» for a carrier that reports", () => {
    expect(orderStageHint(cdek("ACCEPTED_AT_SHIPMENT_WAREHOUSE"))).toBe("shipped")
  })

  it("says «money returned» for a refund", () => {
    expect(orderStageHint(order({ payment_status: "refunded" }))).toBe("returnedRefund")
    expect(orderStageHint(cdek("RETURNED_TO_SENDER"))).toBe("returned")
  })
})

const ru = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../../messages/ru.json"), "utf8")
) as { OrderStage: { label: Record<string, string>; title: Record<string, string>; hint: Record<string, string> } }

// Ivan 14.10: «статусы заказа "ожидает оплаты" "собирается" "ожидает отправки" "отправлен" "в пути" и тд».
describe("the words the buyer and the owner read", () => {
  it("ru names the chain the way the brief and the panel do", () => {
    expect(ru.OrderStage.label).toEqual({
      awaitingPayment: "Ожидает оплаты",
      awaitingConfirmation: "Ожидает подтверждения оплаты",
      receiptRejected: "Чек не принят",
      packing: "Собирается",
      awaitingShipment: "Ожидает отправки",
      shipped: "Отправлен",
      inTransit: "В пути",
      atPickupPoint: "Ждёт в пункте выдачи",
      withCourier: "Передан курьеру",
      received: "Получен",
      accessOpen: "Доступ открыт",
      canceled: "Отменён",
      returning: "Не вручён — возвращается",
      returned: "Возвращён",
    })
  })

  it("has a title for every stage and a sentence for every hint", () => {
    const hints = ["shippedPochta", "shippedNoFeed", "returnedRefund"]
    expect(Object.keys(ru.OrderStage.title).sort()).toEqual([...ORDER_STAGES].sort())
    expect(Object.keys(ru.OrderStage.hint).sort()).toEqual([...ORDER_STAGES, ...hints].sort())
  })
})
