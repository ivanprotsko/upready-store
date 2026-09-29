import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * A-14 (46df audit): the cart's shipping options and price calculation were
 * `force-cache` — an owner's price change, or a disabled shipping method,
 * never reached a checkout already open on the page. `no-store` on both, and
 * `React.cache()` so more than one component reading the same cart's options
 * in one render still costs one request.
 */

const clientFetch = vi.fn()

vi.mock("@lib/config", () => ({
  sdk: { client: { fetch: (...args: unknown[]) => clientFetch(...args) } },
}))

vi.mock("./cookies", () => ({
  getAuthHeaders: async () => ({ authorization: "Bearer token" }),
  getCacheOptions: async (tag: string) => ({ tags: [tag] }),
}))

const fetchOptions = () => clientFetch.mock.calls[0]?.[1] as { cache?: string }

beforeEach(() => {
  clientFetch.mockReset()
})

describe("listCartShippingMethods: cache option", () => {
  it("is no-store, not force-cache", async () => {
    clientFetch.mockResolvedValue({ shipping_options: [] })
    const { listCartShippingMethods } = await import("./fulfillment")

    await listCartShippingMethods("cart_1")

    expect(fetchOptions().cache).toBe("no-store")
  })

  // Not tested here: `React.cache()`'s actual per-render dedup. Its
  // memoization is scoped to a live React Server Component render/action
  // cache boundary (a `react-server` bundler condition), which a Vitest/Node
  // run of this module never sets up — the wrapper here calls straight
  // through unmemoized outside that environment, so an assertion on call
  // count would test Vitest's environment rather than this fix; it is wired
  // (`export const … = cache(async (cartId) => …)`, same shape
  // `lib/data/platform-pricing.ts` already uses) and would need a live
  // Next.js render or a `react-server`-conditioned test runner to observe.
})

describe("calculatePriceForShippingOption: cache option", () => {
  it("is no-store", async () => {
    clientFetch.mockResolvedValue({ shipping_option: { id: "so_1" } })
    const { calculatePriceForShippingOption } = await import("./fulfillment")

    await calculatePriceForShippingOption("so_1", "cart_1")

    expect(fetchOptions().cache).toBe("no-store")
  })
})
