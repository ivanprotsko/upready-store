import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { HttpTypes } from "@medusajs/types"
import { NextIntlClientProvider } from "next-intl"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import PaymentSessionError from "@modules/checkout/components/payment-session-error"

/**
 * t-2026-10-04-44. On cherkashino.ru the proxy in front of the Store API answered
 * one checkout call with 502. `initiatePaymentSession` threw `Error: Bad Gateway`,
 * the server action answered HTTP 500, and the buyer read «Что-то пошло не так»
 * under Robokassa. Here the upstream answers 502 the way the js-sdk reports it
 * (a `FetchError` with `status`). The checkout keeps rendering. The payment
 * action answers a key instead of throwing, the cart read retries, and the
 * payment block draws its own line with a retry button.
 */

const clientFetch = vi.fn()
const initiate = vi.fn()

vi.mock("@lib/config", () => ({
  sdk: {
    client: { fetch: (...args: unknown[]) => clientFetch(...args) },
    store: {
      payment: {
        initiatePaymentSession: (...args: unknown[]) => initiate(...args),
      },
    },
  },
}))

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  unstable_rethrow: vi.fn(),
}))

vi.mock("./cookies", () => ({
  getAuthHeaders: async () => ({}),
  getCacheOptions: async () => ({}),
  getCacheTag: async () => "tag",
  getCartId: async () => "cart_1",
  getCountryCode: async () => "ru",
  removeCartId: vi.fn(),
  setCartId: vi.fn(),
  setCountryCode: vi.fn(),
}))

vi.mock("./regions", () => ({ getRegion: async () => ({ id: "reg_ru" }) }))
vi.mock("./locale-actions", () => ({ getLocale: async () => "ru" }))

// The retry waits 400 ms in production. The tests skip the wait.
vi.mock("@lib/util/upstream-retry", async (importOriginal) => {
  const real = await importOriginal<typeof import("@lib/util/upstream-retry")>()
  return {
    ...real,
    retryOnGatewayFailure: <T,>(
      label: string,
      call: () => Promise<T>,
      options: { idempotent: boolean }
    ) => real.retryOnGatewayFailure(label, call, { ...options, delayMs: 0 }),
  }
})

const badGateway = () =>
  Object.assign(new Error("Bad Gateway"), { status: 502, statusText: "Bad Gateway" })

const cart = {
  id: "cart_1",
  payment_collection: null,
} as unknown as HttpTypes.StoreCart
const robokassa = { provider_id: "pp_robokassa_robokassa" }

const messages = JSON.parse(
  readFileSync(join(__dirname, "../../../messages/ru.json"), "utf8")
)

const render = (error: string | null) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="ru" messages={messages}>
      <PaymentSessionError error={error} retrying={false} onRetry={() => {}} />
    </NextIntlClientProvider>
  )

let errorLog: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  clientFetch.mockReset()
  initiate.mockReset()
  vi.spyOn(console, "warn").mockImplementation(() => {})
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => vi.restoreAllMocks())

describe("payment session when the upstream answers 502", () => {
  it("creates the session on the retry after one 502", async () => {
    initiate
      .mockRejectedValueOnce(badGateway())
      .mockResolvedValueOnce({ payment_collection: { id: "paycol_1" } })
    const { initiatePaymentSessionOrReason } = await import("./cart")

    await expect(initiatePaymentSessionOrReason(cart, robokassa)).resolves.toBeNull()
    expect(initiate).toHaveBeenCalledTimes(2)
  })

  it("answers paymentNotReady instead of throwing when the retry gets a 502 too, and logs it", async () => {
    initiate.mockRejectedValue(badGateway())
    const { initiatePaymentSessionOrReason } = await import("./cart")

    await expect(initiatePaymentSessionOrReason(cart, robokassa)).resolves.toEqual({
      error: "paymentNotReady",
    })
    expect(initiate).toHaveBeenCalledTimes(2)
    expect(String(errorLog.mock.calls[0]?.[0])).toBe(
      "[checkout:payment-session] cart=cart_1 provider=pp_robokassa_robokassa failed with 502 Bad Gateway"
    )
  })

  it("does not repeat a refusal the backend gave, and names it", async () => {
    initiate.mockRejectedValue(
      Object.assign(new Error("Payment provider is not enabled"), { status: 400 })
    )
    const { initiatePaymentSessionOrReason } = await import("./cart")

    await expect(initiatePaymentSessionOrReason(cart, robokassa)).resolves.toEqual({
      error: "paymentFailed",
    })
    expect(initiate).toHaveBeenCalledTimes(1)
  })

  it("draws the block's own line and a retry button, not «Что-то пошло не так»", () => {
    const html = render("paymentNotReady")

    expect(html).toContain('data-testid="payment-session-error"')
    expect(html).toContain(messages.Errors.paymentNotReady)
    expect(html).toContain(messages.CheckoutPage.retryPaymentSetup)
    expect(html).not.toContain("Что-то пошло не так")
  })

  it("draws nothing while the session has no failure", () => {
    expect(render(null)).toBe("")
  })
})

describe("the checkout's cart read when the upstream answers 502", () => {
  it("answers the cart from the retry, so the checkout renders instead of sending the buyer to the cart page", async () => {
    clientFetch
      .mockRejectedValueOnce(badGateway())
      .mockResolvedValueOnce({ cart: { id: "cart_1" } })
    const { retrieveCart } = await import("./cart")

    await expect(retrieveCart()).resolves.toEqual({ id: "cart_1" })
    expect(clientFetch).toHaveBeenCalledTimes(2)
  })

  it("logs a cart it could not read, but stays quiet about a cart that is gone", async () => {
    const { retrieveCart } = await import("./cart")

    clientFetch.mockRejectedValue(badGateway())
    await expect(retrieveCart()).resolves.toBeNull()
    expect(String(errorLog.mock.calls[0]?.[0])).toBe(
      "[cart] retrieveCart cart_1 failed with 502 Bad Gateway"
    )

    errorLog.mockClear()
    clientFetch.mockReset()
    clientFetch.mockRejectedValue(
      Object.assign(new Error("Cart with id: cart_1 was not found"), { status: 404 })
    )
    await expect(retrieveCart()).resolves.toBeNull()
    expect(errorLog).not.toHaveBeenCalled()
  })
})
