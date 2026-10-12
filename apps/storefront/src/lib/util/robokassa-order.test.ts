import { describe, expect, it } from "vitest"

import { buyerOrderStatus } from "./buyer-order-status"
import {
  nextConfirmingRefreshMs,
  robokassaOrderPayment,
  ROBOKASSA_CONFIRMING_FAST_MS,
  ROBOKASSA_CONFIRMING_SLOW_MS,
} from "./robokassa-order"

/**
 * t-2026-10-12-13. Ivan 12.10, 1.2: «перенаправлять на страницу оформленного
 * заказа и там показывать информацию, что платеж еще подтверждается. Тем не
 * менее этот статус нужно переосмыслить … обычно сразу сообщают что оплата
 * прошла успешно».
 */

const collection = (extra: Record<string, unknown>) => ({ id: "paycol_1", ...extra })

describe("robokassaOrderPayment", () => {
  it("is paid once Robokassa's payment exists, authorized at the return or captured by the Result", () => {
    expect(
      robokassaOrderPayment({
        payment_collections: [collection({ payments: [{ provider_id: "pp_robokassa_robokassa" }] })],
      })
    ).toBe("paid")
  })

  it("is confirming for an order placed while Robokassa's confirmation is on its way", () => {
    expect(
      robokassaOrderPayment({
        payment_collections: [
          collection({
            payments: [],
            payment_sessions: [{ provider_id: "pp_robokassa_robokassa", status: "pending_authorization" }],
          }),
        ],
      })
    ).toBe("confirming")
  })

  it("says nothing about an order of another provider, or a cancelled Robokassa payment", () => {
    expect(
      robokassaOrderPayment({
        payment_collections: [collection({ payments: [{ provider_id: "pp_system_default" }] })],
      })
    ).toBeNull()
    expect(
      robokassaOrderPayment({
        payment_collections: [
          collection({ payments: [{ provider_id: "pp_robokassa_robokassa", canceled_at: "2026-10-12" }] }),
        ],
      })
    ).toBeNull()
    expect(robokassaOrderPayment({ payment_collections: null })).toBeNull()
  })
})

describe("buyerOrderStatus for a Robokassa order", () => {
  it("reads «paid» for an authorized Robokassa payment, never «awaiting payment»", () => {
    expect(
      buyerOrderStatus({
        status: "pending",
        payment_status: "authorized",
        payment_collections: [collection({ payments: [{ provider_id: "pp_robokassa_robokassa" }] })],
      })
    ).toBe("paid")
  })

  it("reads as being confirmed while Robokassa's confirmation is on its way", () => {
    expect(
      buyerOrderStatus({
        status: "pending",
        payment_status: "not_paid",
        payment_collections: [
          collection({ payment_sessions: [{ provider_id: "pp_robokassa_robokassa", status: "pending_authorization" }] }),
        ],
      })
    ).toBe("awaitingConfirmation")
  })

  it("keeps an authorized manual transfer as awaiting payment", () => {
    expect(
      buyerOrderStatus({
        status: "pending",
        payment_status: "authorized",
        payment_collections: [collection({ payments: [{ provider_id: "pp_system_default" }] })],
      })
    ).toBe("awaitingPayment")
  })
})

describe("nextConfirmingRefreshMs", () => {
  it("asks every few seconds at first, then slower, then stops", () => {
    expect(nextConfirmingRefreshMs(0)).toBe(ROBOKASSA_CONFIRMING_FAST_MS)
    expect(nextConfirmingRefreshMs(3 * 60_000)).toBe(ROBOKASSA_CONFIRMING_SLOW_MS)
    expect(nextConfirmingRefreshMs(16 * 60_000)).toBeNull()
  })
})
