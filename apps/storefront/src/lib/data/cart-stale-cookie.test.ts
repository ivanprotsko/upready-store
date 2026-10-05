import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The regression this file holds: a `_medusa_cart_id` cookie that names a cart
 * the backend no longer has (a database reset, a cart of another environment)
 * made the country switcher throw, because `applyRegion` updated the cart
 * without a look at whether it was there (`t-port-stale-cart-fix`, ported from
 * cherkashino-store `aeffa62`).
 *
 * The port is narrower than its source on one point. The source dropped the
 * cookie whenever `retrieveCart` answered null, and `retrieveCart` answers null
 * for ANY failure, so one backend hiccup would have cost a buyer their cart.
 * Only a 404 drops the cookie here.
 */

const clientFetch = vi.fn()
const cartUpdate = vi.fn()
const removeCartId = vi.fn()
const setCountryCode = vi.fn()
const isShopRegion = vi.fn()

vi.mock("@lib/config", () => ({
  sdk: {
    client: { fetch: (...args: unknown[]) => clientFetch(...args) },
    store: { cart: { update: (...args: unknown[]) => cartUpdate(...args) } },
  },
}))

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))

vi.mock("./cookies", () => ({
  getAuthHeaders: async () => ({}),
  getCacheOptions: async () => ({}),
  getCacheTag: async () => "tag",
  getCartId: async () => "cart_1",
  getCountryCode: async () => "ru",
  removeCartId: (...args: unknown[]) => removeCartId(...args),
  setCartId: vi.fn(),
  setCountryCode: (...args: unknown[]) => setCountryCode(...args),
}))

vi.mock("./regions", () => ({
  getRegion: async () => ({ id: "reg_de" }),
  isShopRegion: (...args: unknown[]) => isShopRegion(...args),
}))

vi.mock("./locale-actions", () => ({ getLocale: async () => "ru" }))

const gone = Object.assign(new Error("Cart with id: cart_1 was not found"), {
  status: 404,
})
const down = Object.assign(new Error("Internal Server Error"), { status: 500 })

describe("applyRegion with a cart cookie", () => {
  beforeEach(() => {
    clientFetch.mockReset()
    cartUpdate.mockReset()
    removeCartId.mockReset()
    setCountryCode.mockReset()
    isShopRegion.mockReset()
    isShopRegion.mockResolvedValue(true)
  })

  it("drops the cookie of a cart the backend no longer has and switches the country", async () => {
    clientFetch.mockRejectedValue(gone)
    cartUpdate.mockRejectedValue(gone)
    const { applyRegion } = await import("./cart")

    await expect(applyRegion("de")).resolves.toBeUndefined()

    expect(setCountryCode).toHaveBeenCalledWith("de", { explicit: true })
    expect(removeCartId).toHaveBeenCalledTimes(1)
    expect(cartUpdate).not.toHaveBeenCalled()
  })

  it("keeps the cookie when the backend fails for another reason", async () => {
    clientFetch.mockRejectedValue(down)
    cartUpdate.mockRejectedValue(down)
    const { applyRegion } = await import("./cart")

    await expect(applyRegion("de")).rejects.toThrow()

    expect(removeCartId).not.toHaveBeenCalled()
  })

  it("moves a cart that exists to the new region", async () => {
    clientFetch.mockResolvedValue({
      cart: { id: "cart_1", shipping_address: { country_code: "ru" } },
    })
    cartUpdate.mockResolvedValue({ cart: { id: "cart_1" } })
    const { applyRegion } = await import("./cart")

    await applyRegion("de")

    expect(removeCartId).not.toHaveBeenCalled()
    expect(cartUpdate).toHaveBeenCalledWith(
      "cart_1",
      expect.objectContaining({ region_id: "reg_de" }),
      {},
      {}
    )
  })
})

describe("applyRegion outside the shop's regions (N9, t-2026-10-04-19)", () => {
  beforeEach(() => {
    clientFetch.mockReset()
    cartUpdate.mockReset()
    removeCartId.mockReset()
    setCountryCode.mockReset()
    isShopRegion.mockReset()
  })

  it("refuses a country the shop does not sell in: no cookie, no cart move", async () => {
    isShopRegion.mockResolvedValue(false)
    clientFetch.mockResolvedValue({
      cart: { id: "cart_1", shipping_address: { country_code: "ru" } },
    })
    const { applyRegion } = await import("./cart")

    await expect(applyRegion("de")).resolves.toBeUndefined()

    expect(isShopRegion).toHaveBeenCalledWith("reg_de")
    expect(setCountryCode).not.toHaveBeenCalled()
    expect(clientFetch).not.toHaveBeenCalled()
    expect(cartUpdate).not.toHaveBeenCalled()
  })
})
