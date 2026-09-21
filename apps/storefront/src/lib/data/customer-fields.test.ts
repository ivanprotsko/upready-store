import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The regression this file holds: `retrieveCustomer` asked the backend for
 * `fields: "*orders"` on every read of the signed-in buyer. Nothing on the
 * storefront reads `customer.orders` (the account pages call `listOrders`), and
 * a customer is one row for the whole platform, so the relation carried the
 * buyer's orders from every shop into a `force-cache` entry
 * (architecture review 2026-09-21, finding D-1).
 */

const clientFetch = vi.fn()

vi.mock("@lib/config", () => ({
  sdk: { client: { fetch: (...args: unknown[]) => clientFetch(...args) } },
}))

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))

vi.mock("./cookies", () => ({
  getAuthHeaders: async () => ({ authorization: "Bearer token" }),
  getCacheOptions: async () => ({ tags: ["customers-cache_1"] }),
  getCacheTag: async () => "customers-cache_1",
  getCartId: async () => undefined,
  removeAuthToken: vi.fn(),
  removeCartId: vi.fn(),
  setAuthToken: vi.fn(),
}))

vi.mock("./orders", () => ({ claimGuestOrders: vi.fn() }))
vi.mock("./locale-actions", () => ({ getLocale: async () => "ru" }))

describe("retrieveCustomer", () => {
  beforeEach(() => {
    clientFetch.mockReset()
    clientFetch.mockResolvedValue({ customer: { id: "cus_1" } })
  })

  it("reads the signed-in customer with the token and the customers cache tag", async () => {
    const { retrieveCustomer } = await import("./customer")

    await expect(retrieveCustomer()).resolves.toEqual({ id: "cus_1" })

    expect(clientFetch).toHaveBeenCalledTimes(1)
    expect(clientFetch).toHaveBeenCalledWith(
      "/store/customers/me",
      expect.objectContaining({
        method: "GET",
        headers: { authorization: "Bearer token" },
        next: { tags: ["customers-cache_1"] },
        cache: "force-cache",
      })
    )
  })

  it("does not ask for the orders relation", async () => {
    const { retrieveCustomer } = await import("./customer")

    await retrieveCustomer()

    const [, options] = clientFetch.mock.calls[0]

    expect(JSON.stringify(options.query ?? {})).not.toContain("orders")
  })
})
