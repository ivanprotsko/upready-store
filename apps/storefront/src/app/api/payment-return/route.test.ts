import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * t-2026-10-04-48. Ivan paid on cherkashino.ru, Robokassa sent him back, and he
 * stared at a blank tab for about nine seconds (this route retried `placeOrder`
 * six times) before landing on the CART under «Платёж не прошёл». The route now
 * answers at once and never names the cart: a failure goes to the filled
 * checkout, a success to the shop's waiting page, which looks for the order.
 */

const setCartId = vi.fn()
const placeOrder = vi.fn()

vi.mock("@lib/data/cookies", () => ({
  getAuthHeaders: async () => ({}),
  setCartId: (...args: unknown[]) => setCartId(...args),
}))
vi.mock("@lib/data/cart", () => ({
  placeOrder: (...args: unknown[]) => placeOrder(...args),
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

  it("sends a success to the waiting page at once, without completing the cart itself", async () => {
    const res = await robokassaReturn(
      "provider=robokassa&cart_id=cart_1&outcome=success&locale=ru"
    )

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(
      "https://cherkashino.ru/ru/payment-return"
    )
    expect(setCartId).toHaveBeenCalledWith("cart_1")
    // The old route blocked here for ~9 s, retrying the completion.
    expect(placeOrder).not.toHaveBeenCalled()
  })

  it("keeps the buyer's language, and falls back to the default for an unknown one", async () => {
    const en = await robokassaReturn(
      "provider=robokassa&cart_id=cart_1&outcome=fail&locale=en"
    )
    expect(en.headers.get("location")).toBe(
      "https://cherkashino.ru/en/checkout?payment=failed"
    )

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
