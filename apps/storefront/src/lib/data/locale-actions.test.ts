import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The regression this file holds: the language switcher writes the new locale
 * onto the visitor's cart, and a `_medusa_cart_id` cookie that names a cart the
 * backend no longer has made the whole switch throw
 * (`t-port-stale-cart-fix`, ported from cherkashino-store `aeffa62`).
 */

const cartUpdate = vi.fn()
const removeCartId = vi.fn()
const cookieSet = vi.fn()

vi.mock("@lib/config", () => ({
  sdk: {
    store: { cart: { update: (...args: unknown[]) => cartUpdate(...args) } },
  },
}))

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }))

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: (...args: unknown[]) => cookieSet(...args),
  }),
}))

vi.mock("./cart", () => ({ applyRegion: vi.fn() }))

vi.mock("./cookies", () => ({
  getAuthHeaders: async () => ({}),
  getCacheTag: async () => "tag",
  getCartId: async () => "cart_1",
  removeCartId: (...args: unknown[]) => removeCartId(...args),
}))

describe("updateLocale with a cart cookie", () => {
  beforeEach(() => {
    cartUpdate.mockReset()
    removeCartId.mockReset()
    cookieSet.mockReset()
  })

  it("drops the cookie of a cart the backend no longer has and switches the language", async () => {
    cartUpdate.mockRejectedValue(
      Object.assign(new Error("Cart with id: cart_1 was not found"), {
        status: 404,
      })
    )
    const { updateLocale } = await import("./locale-actions")

    await expect(updateLocale("en")).resolves.toBe("en")

    expect(cookieSet).toHaveBeenCalledWith(
      "_medusa_locale",
      "en",
      expect.anything()
    )
    expect(removeCartId).toHaveBeenCalledTimes(1)
  })

  it("still fails, and keeps the cookie, when the backend fails for another reason", async () => {
    cartUpdate.mockRejectedValue(
      Object.assign(new Error("Internal Server Error"), { status: 500 })
    )
    const { updateLocale } = await import("./locale-actions")

    await expect(updateLocale("en")).rejects.toThrow("Internal Server Error")

    expect(removeCartId).not.toHaveBeenCalled()
  })
})
