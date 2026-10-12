import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * t-2026-10-04-48. Ivan paid on cherkashino.ru, Robokassa sent him back, and he
 * stared at a blank tab for about nine seconds (this route retried `placeOrder`
 * six times) before landing on the CART under «Платёж не прошёл». The route now
 * answers at once and never names the cart: a failure goes to the filled
 * checkout. A Robokassa success goes straight to the order page
 * (t-2026-10-12-13); the other gateways' success to the waiting page, which
 * looks for the order.
 */

const setCartId = vi.fn()
const placeOrder = vi.fn()
const completeCartAfterReturn = vi.fn()
const confirmRobokassaReturn = vi.fn()

vi.mock("@lib/data/cookies", () => ({
  getAuthHeaders: async () => ({}),
  setCartId: (...args: unknown[]) => setCartId(...args),
}))
vi.mock("@lib/data/cart", () => ({
  placeOrder: (...args: unknown[]) => placeOrder(...args),
  completeCartAfterReturn: (...args: unknown[]) => completeCartAfterReturn(...args),
}))
vi.mock("@lib/data/payment", () => ({
  confirmRobokassaReturn: (...args: unknown[]) => confirmRobokassaReturn(...args),
}))
vi.mock("@lib/config", () => ({ sdk: { client: { fetch: vi.fn() } } }))

const live = { host: "cherkashino.ru", "x-forwarded-proto": "https" }

const robokassaReturn = async (query: string) => {
  const { GET } = await import("./route")
  return GET(
    new NextRequest(`http://0.0.0.0:8000/api/payment-return?${query}`, {
      headers: live,
    })
  )
}

describe("GET /api/payment-return, provider=robokassa", () => {
  beforeEach(() => {
    setCartId.mockReset()
    placeOrder.mockReset()
    completeCartAfterReturn.mockReset()
    confirmRobokassaReturn.mockReset()
    // Unless a test says otherwise, the backend answers and no order comes out.
    confirmRobokassaReturn.mockResolvedValue({ status: "pending" })
    completeCartAfterReturn.mockResolvedValue(null)
  })

  it("sends a failed payment straight to the filled checkout with the failure notice", async () => {
    const res = await robokassaReturn(
      "provider=robokassa&cart_id=cart_1&outcome=fail&locale=ru"
    )

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(
      "https://cherkashino.ru/ru/checkout?payment=failed"
    )
    expect(setCartId).toHaveBeenCalledWith("cart_1")
    expect(placeOrder).not.toHaveBeenCalled()
  })

  // t-2026-10-12-13, Ivan 12.10: «если заказ прошел успешно, то нужно
  // перенаправлять на страницу успешного заказа а не корзину», and 1.3: no
  // waiting screen of ours after Robokassa.
  it("sends a success straight to the order page, the return checked and the cart completed server-side", async () => {
    confirmRobokassaReturn.mockResolvedValue({ status: "confirmed" })
    completeCartAfterReturn.mockResolvedValue("/en/order/order_1/confirmed?token=tok")

    const res = await robokassaReturn(
      "OutSum=1740.00&InvId=1230629747&Shp_SessionID=payses_1&SignatureValue=ABC&IsTest=1&provider=robokassa&cart_id=cart_1&outcome=success&locale=ru&Culture=ru"
    )

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(
      "https://cherkashino.ru/ru/order/order_1/confirmed?token=tok"
    )
    expect(setCartId).toHaveBeenCalledWith("cart_1")
    // Robokassa's own parameters reach the backend's check verbatim.
    expect(confirmRobokassaReturn).toHaveBeenCalledWith("cart_1", {
      OutSum: "1740.00",
      InvId: "1230629747",
      SignatureValue: "ABC",
      Shp_SessionID: "payses_1",
    })
    expect(completeCartAfterReturn).toHaveBeenCalledWith("cart_1")
  })

  it("places the order also when nothing proved the payment yet (the modal's return in test mode)", async () => {
    confirmRobokassaReturn.mockResolvedValue({ status: "pending" })
    completeCartAfterReturn.mockResolvedValue("/ru/order/order_2/confirmed")

    const res = await robokassaReturn("provider=robokassa&cart_id=cart_1&outcome=success&locale=ru")

    expect(res.headers.get("location")).toBe("https://cherkashino.ru/ru/order/order_2/confirmed")
    expect(confirmRobokassaReturn).toHaveBeenCalledWith("cart_1", {
      OutSum: undefined,
      InvId: undefined,
      SignatureValue: undefined,
      Shp_SessionID: undefined,
    })
  })

  it("sends a success Robokassa says was never paid back to the checkout with the failure notice", async () => {
    confirmRobokassaReturn.mockResolvedValue({ status: "not_paid" })

    const res = await robokassaReturn("provider=robokassa&cart_id=cart_1&outcome=success&locale=ru")

    expect(res.headers.get("location")).toBe("https://cherkashino.ru/ru/checkout?payment=failed")
    expect(completeCartAfterReturn).not.toHaveBeenCalled()
  })

  it("falls back to the waiting page only when the backend cannot be asked or no order came out", async () => {
    confirmRobokassaReturn.mockRejectedValue(new Error("backend down"))
    const down = await robokassaReturn("provider=robokassa&cart_id=cart_1&outcome=success&locale=ru")
    expect(down.headers.get("location")).toBe("https://cherkashino.ru/ru/payment-return")
    expect(completeCartAfterReturn).not.toHaveBeenCalled()

    confirmRobokassaReturn.mockResolvedValue({ status: "pending" })
    completeCartAfterReturn.mockResolvedValue(null)
    const noOrder = await robokassaReturn("provider=robokassa&cart_id=cart_1&outcome=success&locale=ru")
    expect(noOrder.headers.get("location")).toBe("https://cherkashino.ru/ru/payment-return")
  })

  it("keeps the buyer's language, and falls back to the default for an unknown one", async () => {
    const en = await robokassaReturn(
      "provider=robokassa&cart_id=cart_1&outcome=fail&locale=en"
    )
    expect(en.headers.get("location")).toBe(
      "https://cherkashino.ru/en/checkout?payment=failed"
    )

    confirmRobokassaReturn.mockResolvedValue({ status: "no_session" })
    const unknown = await robokassaReturn(
      "provider=robokassa&cart_id=cart_1&outcome=success&locale=xx"
    )
    expect(unknown.headers.get("location")).toMatch(
      /^https:\/\/cherkashino\.ru\/[a-z]{2}\/payment-return$/
    )
  })

  it("lands a return with no cart on the checkout too, never on the cart", async () => {
    const res = await robokassaReturn("provider=robokassa&outcome=success&locale=ru")

    expect(res.headers.get("location")).toBe(
      "https://cherkashino.ru/ru/checkout?payment=failed"
    )
    expect(setCartId).not.toHaveBeenCalled()
  })

  it.each([
    "provider=robokassa&cart_id=cart_1&outcome=fail&locale=ru",
    "provider=robokassa&cart_id=cart_1&outcome=success&locale=ru",
    "provider=robokassa&locale=ru",
  ])("never redirects a Robokassa return to the cart (%s)", async (query) => {
    const res = await robokassaReturn(query)
    expect(res.headers.get("location")).not.toContain("/cart")
  })
})

describe("GET /api/payment-return, provider=btcpay", () => {
  beforeEach(() => {
    setCartId.mockReset()
    placeOrder.mockReset()
  })

  it("sends the buyer back from BTCPay to the waiting page, deciding nothing itself", async () => {
    const res = await robokassaReturn("provider=btcpay&cart_id=cart_1&locale=en")

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("https://cherkashino.ru/en/payment-return")
    expect(setCartId).toHaveBeenCalledWith("cart_1")
    expect(placeOrder).not.toHaveBeenCalled()
  })

  it("lands a BTCPay return without a cart on the checkout", async () => {
    const res = await robokassaReturn("provider=btcpay&locale=en")

    expect(res.headers.get("location")).toBe("https://cherkashino.ru/en/checkout?payment=failed")
    expect(setCartId).not.toHaveBeenCalled()
  })
})

describe("GET /api/payment-return, provider=bitcart", () => {
  beforeEach(() => {
    setCartId.mockReset()
    placeOrder.mockReset()
  })

  it("sends the buyer back from Bitcart to the waiting page, deciding nothing itself", async () => {
    const res = await robokassaReturn("provider=bitcart&cart_id=cart_1&locale=en")

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("https://cherkashino.ru/en/payment-return")
    expect(setCartId).toHaveBeenCalledWith("cart_1")
    expect(placeOrder).not.toHaveBeenCalled()
  })
})

/**
 * t-cherk-22, part B. Tribute's success and fail addresses carry an `outcome`
 * the way Robokassa's do, and Tribute's final `shop_order` webhook is what makes
 * the order on the backend, so the return decides nothing either.
 */
describe("GET /api/payment-return, provider=tribute", () => {
  beforeEach(() => {
    setCartId.mockReset()
    placeOrder.mockReset()
  })

  it("sends a success to the waiting page at once, without completing the cart itself", async () => {
    const res = await robokassaReturn("provider=tribute&cart_id=cart_1&outcome=success&locale=ru")

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("https://cherkashino.ru/ru/payment-return")
    expect(setCartId).toHaveBeenCalledWith("cart_1")
    expect(placeOrder).not.toHaveBeenCalled()
  })

  it("sends a failure straight to the filled checkout with the failure notice", async () => {
    const res = await robokassaReturn("provider=tribute&cart_id=cart_1&outcome=fail&locale=en")

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("https://cherkashino.ru/en/checkout?payment=failed")
    expect(setCartId).toHaveBeenCalledWith("cart_1")
    expect(placeOrder).not.toHaveBeenCalled()
  })

  it("lands a Tribute return without a cart on the checkout, never on the cart", async () => {
    const res = await robokassaReturn("provider=tribute&outcome=success&locale=ru")

    expect(res.headers.get("location")).toBe("https://cherkashino.ru/ru/checkout?payment=failed")
    expect(setCartId).not.toHaveBeenCalled()
  })
})
