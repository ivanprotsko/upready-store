import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  APISHIP_STAGES,
  CDEK_STAGES,
  ORDER_STAGES,
  ORDER_STAGE_COLORS,
  orderStage,
  orderStageKey,
  paymentRepeatsStage,
} from "../lib/order-stage.ts"
import { manualPaymentStatus } from "../lib/order-helpers.ts"

/**
 * t-2026-10-14-58, step C: the order's one stage, the word the buyer reads on
 * the storefront, in the list's «Статус» column, on the customer page and in
 * the card header. The same rows as the storefront's
 * `apps/storefront/src/lib/util/order-stage.test.ts`: the chain, both carriers,
 * the course and the side exits. The screens are asserted on the source: this
 * package cannot render JSX (see `error-boundary-auth.test.mjs`).
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (path) => readFileSync(join(SRC, path), "utf8")
const ru = JSON.parse(read("i18n/translations/ru.json"))
const en = JSON.parse(read("i18n/translations/en.json"))

const order = (over = {}) => ({
  status: "pending",
  payment_status: "captured",
  metadata: null,
  items: [{ requires_shipping: true }],
  fulfillments: [],
  ...over,
})
const cdek = (code, over = {}) => order({ fulfillments: [{ data: { cdek_order_uuid: "u1", cdek_status: code }, ...over }] })
const apiship = (key, over = {}) => order({ fulfillments: [{ data: { provider: "apiship", apiship_status: key }, ...over }] })
const receipt = (extra = {}) => ({ payment_receipt: { file_url: "/r.jpg", ...extra } })
const ownPickup = { pickup_point_id: "p1", pickup_point_name: "Магазин" }
const course = [{ requires_shipping: false }]

const ROWS = [
  ["manual transfer, no receipt", order({ payment_status: "not_paid" }), "awaitingPayment"],
  ["manual transfer, receipt sent", order({ payment_status: "not_paid", metadata: receipt() }), "awaitingConfirmation"],
  ["manual transfer, receipt rejected", order({ payment_status: "not_paid", metadata: receipt({ status: "rejected" }) }), "receiptRejected"],
  ["authorized, nothing captured", order({ payment_status: "authorized" }), "awaitingPayment"],
  // BTCPay, Bitcart and Tribute place an order only once their session reads
  // `captured`, and Medusa captures the payment right there: paid, the same as
  // the storefront's `buyerOrderStatus` (`order-stage.test.ts`).
  ["BTCPay: settled, captured at checkout", order({ payment_collections: [{ payments: [{ provider_id: "pp_btcpay_btcpay" }] }] }), "packing"],
  ["Bitcart: complete, captured at checkout", order({ payment_collections: [{ payments: [{ provider_id: "pp_bitcart_bitcart" }] }] }), "packing"],
  ["Tribute: paid, captured at checkout", order({ payment_collections: [{ payments: [{ provider_id: "pp_tribute_tribute" }] }] }), "packing"],
  ["a BTCPay payment authorized, not captured", order({ payment_status: "authorized", payment_collections: [{ payments: [{ provider_id: "pp_btcpay_btcpay" }] }] }), "awaitingPayment"],
  ["Robokassa payment exists, capture on its way", order({ payment_status: "authorized", payment_collections: [{ payments: [{ provider_id: "pp_robokassa_robokassa" }] }] }), "packing"],
  ["Robokassa confirmation on its way", order({ payment_status: "not_paid", payment_collections: [{ payments: [], payment_sessions: [{ provider_id: "pp_robokassa_robokassa", status: "pending_authorization" }] }] }), "awaitingConfirmation"],
  ["paid, nothing fulfilled", order(), "packing"],
  ["paid, the only fulfillment cancelled", order({ fulfillments: [{ canceled_at: "2026-10-14" }] }), "packing"],
  ["paid, part of the lines packed", order({ fulfillment_status: "partially_fulfilled", fulfillments: [{}] }), "packing"],
  ["paid, packed, no carrier status", order({ fulfillments: [{ packed_at: "2026-10-14" }] }), "awaitingShipment"],
  ["СДЭК: order created", cdek("CREATED"), "awaitingShipment"],
  ["СДЭК: at the sender warehouse", cdek("ACCEPTED_AT_SHIPMENT_WAREHOUSE", { shipped_at: "2026-10-14" }), "shipped"],
  ["СДЭК: sent to the recipient city", cdek("SENT_TO_RECIPIENT_CITY"), "inTransit"],
  ["СДЭК: at the pickup point", cdek("ACCEPTED_AT_PICK_UP_POINT"), "atPickupPoint"],
  ["СДЭК: with the courier", cdek("TAKEN_BY_COURIER"), "withCourier"],
  ["СДЭК: delivered", cdek("DELIVERED", { delivered_at: "2026-10-16" }), "received"],
  ["СДЭК: a code not mapped keeps the dates", cdek("SOME_NEW_CODE", { shipped_at: "2026-10-14" }), "shipped"],
  ["СДЭК: not delivered", cdek("NOT_DELIVERED"), "returning"],
  ["СДЭК: returned to the sender", cdek("RETURNED_TO_SENDER"), "returned"],
  ["ApiShip: uploaded", apiship("uploaded"), "awaitingShipment"],
  ["ApiShip: on the sending point", apiship("onPointIn"), "shipped"],
  ["ApiShip: on the way", apiship("onWay"), "inTransit"],
  ["ApiShip: ready for the recipient", apiship("readyForRecipient"), "atPickupPoint"],
  ["ApiShip: delivering", apiship("delivering"), "withCourier"],
  ["ApiShip: delivered", apiship("delivered"), "received"],
  ["ApiShip: problem keeps the dates", apiship("problem", { shipped_at: "2026-10-14" }), "shipped"],
  ["ApiShip: returning", apiship("returning"), "returning"],
  ["ApiShip: returned", apiship("returned"), "returned"],
  ["Почта напрямую: shipped stays shipped", order({ fulfillments: [{ shipped_at: "2026-10-14" }] }), "shipped"],
  ["the owner marked it delivered", order({ fulfillments: [{ shipped_at: "2026-10-14", delivered_at: "2026-10-18" }] }), "received"],
  ["the owner marked shipped while ApiShip still uploads", apiship("uploaded", { shipped_at: "2026-10-14" }), "shipped"],
  ["own pickup point: packed", order({ metadata: ownPickup, fulfillments: [{ packed_at: "2026-10-14" }] }), "atPickupPoint"],
  ["two parcels: the slower one speaks", order({ fulfillments: [{ delivered_at: "2026-10-16" }, { shipped_at: "2026-10-14" }] }), "shipped"],
  ["no fulfillments loaded, fulfilled", order({ fulfillments: undefined, fulfillment_status: "fulfilled" }), "awaitingShipment"],
  ["no fulfillments loaded, delivered", order({ fulfillments: undefined, fulfillment_status: "delivered" }), "received"],
  ["not paid yet, but the carrier has the parcel", order({ payment_status: "not_paid", fulfillments: [{ shipped_at: "2026-10-14" }] }), "shipped"],
  ["course: not paid", order({ items: course, payment_status: "not_paid" }), "awaitingPayment"],
  ["course: paid", order({ items: course }), "accessOpen"],
  ["cancelled", order({ status: "canceled", fulfillments: [{ shipped_at: "2026-10-14" }] }), "canceled"],
  ["refunded in full", order({ payment_status: "refunded" }), "returned"],
  ["refunded in part, delivered", order({ payment_status: "partially_refunded", fulfillments: [{ delivered_at: "2026-10-16" }] }), "received"],
]

for (const [name, input, stage] of ROWS) {
  test(`orderStage: ${name} → ${stage}`, () => {
    assert.equal(orderStage(input), stage)
  })
}

test("every stage appears in the table, has a colour and a word in ru and en", () => {
  const seen = new Set(ROWS.map(([, , stage]) => stage))
  assert.deepEqual(ORDER_STAGES.filter((s) => !seen.has(s)), [])
  for (const stage of ORDER_STAGES) {
    assert.ok(ORDER_STAGE_COLORS[stage], `no colour for ${stage}`)
    const [ns, group, key] = orderStageKey(stage).split(".")
    assert.ok(ru[ns][group][key], `ru has no ${orderStageKey(stage)}`)
    assert.ok(en[ns][group][key], `en has no ${orderStageKey(stage)}`)
  }
})

test("the words are the storefront's (Ivan 14.10: «ожидает оплаты, собирается, ожидает отправки, отправлен, в пути»)", () => {
  assert.deepEqual(ru.orders.stage, {
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
  const storefront = JSON.parse(readFileSync(join(SRC, "../../storefront/messages/ru.json"), "utf8"))
  assert.deepEqual(ru.orders.stage, storefront.OrderStage.label)
})

test("the carrier maps are the storefront's", () => {
  const storefront = readFileSync(join(SRC, "../../storefront/src/lib/util/order-stage.ts"), "utf8")
  const block = (name) => {
    const start = storefront.indexOf(`export const ${name}`)
    const body = storefront.slice(start, storefront.indexOf("\n}\n", start))
    return Object.fromEntries(Array.from(body.matchAll(/^\s+(\w+): "(\w+)",$/gm), (m) => [m[1], m[2]]))
  }
  assert.deepEqual(block("CDEK_STAGES"), CDEK_STAGES)
  assert.deepEqual(block("APISHIP_STAGES"), APISHIP_STAGES)
})

test("the list's «Статус» column replaces «Сборка» and loads what the stage reads", () => {
  const columns = read("hooks/table/columns/use-order-table-columns.tsx")
  assert.match(columns, /<OrderStageHeader \/>/)
  assert.match(columns, /<OrderStageCell order=\{row\.original\} \/>/)
  assert.doesNotMatch(columns, /FulfillmentStatusCell/)
  const cell = read("components/table/table-cells/order/order-stage-cell/order-stage-cell.tsx")
  assert.match(cell, /t\("fields\.status"\)/)
  const fields = read("routes/orders/order-list/const.ts")
  for (const f of ["fulfillments.shipped_at", "fulfillments.delivered_at", "fulfillments.canceled_at", "fulfillments.data", "payment_collections.payment_sessions.status"]) {
    assert.ok(fields.includes(`"${f}"`), `the list does not load ${f}`)
  }
  assert.equal(ru.fields.status, "Статус")
})

test("the customer page shows the same stage", () => {
  const page = read("routes/customers/customer-detail/customer-detail.tsx")
  assert.match(page, /<OrderStageCell order=\{order\} \/>/)
  assert.ok(page.includes('"fulfillments.data"'))
})

test("the card header: the stage and the payment, no separate «Отменён» or fulfillment badge", () => {
  const header = read("routes/orders/order-detail/components/order-general-section/order-general-section.tsx")
  assert.match(header, /<StageBadge stage=\{stage\} \/>\s*\{showPayment && <PaymentBadge payment=\{payment\} \/>\}/)
  assert.doesNotMatch(header, /FulfillmentBadge|OrderBadge/)
})

test("the card header shows one badge when the payment means what the stage says (release stand 14.10, lead 15.10)", () => {
  const header = read("routes/orders/order-detail/components/order-general-section/order-general-section.tsx")
  assert.match(header, /const showPayment = !paymentRepeatsStage\(stage, order\.payment_status, manual\?\.stage\)/)
  const t = (key) => key
  const repeats = (order) => paymentRepeatsStage(orderStage(order), order.payment_status, manualPaymentStatus(t, order)?.stage)

  // One badge: «Ожидает оплаты» next to a gateway's «Ждёт оплаты» (not_paid,
  // awaiting), and the manual transfer's three badges next to their own stage.
  for (const payment_status of ["not_paid", "awaiting"]) {
    const gateway = { payment_status, payment_collections: [] }
    assert.equal(orderStage(gateway), "awaitingPayment")
    assert.equal(repeats(gateway), true, payment_status)
  }
  const manual = (metadata) => ({
    payment_status: "not_paid",
    metadata,
    payment_collections: [{ payments: [{ provider_id: "pp_system_default" }] }],
  })
  for (const receipt of [undefined, { status: "pending" }, { status: "rejected" }]) {
    const order = manual(receipt ? { payment_receipt: receipt } : null)
    assert.equal(manualPaymentStatus(t, order).stage, orderStage(order), "the manual badge names its stage")
    assert.equal(repeats(order), true, receipt?.status ?? "no receipt")
  }

  // Two badges: the payment tells more than the stage.
  assert.equal(paymentRepeatsStage("packing", "captured"), false) // «Собирается» + «Оплачен»
  assert.equal(paymentRepeatsStage("shipped", "captured"), false)
  assert.equal(paymentRepeatsStage("shipped", "not_paid"), false) // sent before the money came
  assert.equal(paymentRepeatsStage("shipped", "not_paid", "awaitingPayment"), false)
  for (const payment_status of ["authorized", "partially_authorized", "requires_action", "canceled"]) {
    const gateway = { payment_status, payment_collections: [] }
    assert.equal(orderStage(gateway), "awaitingPayment")
    assert.equal(repeats(gateway), false, payment_status)
  }
})
