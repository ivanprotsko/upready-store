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

describe("calculatePriceForShippingOption: a refusal reaches the card (t-2026-10-09-56, item 9)", () => {
  it("tells CDEK's address refusal from any other failure, and logs the backend's reason", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { calculatePriceForShippingOption } = await import("./fulfillment")

    clientFetch.mockRejectedValueOnce(
      new Error("cdek_address_rejected: СДЭК не нашёл адрес — проверьте индекс и город")
    )
    expect(await calculatePriceForShippingOption("so_cdek", "cart_1")).toEqual({
      error: "cdek_address_rejected",
    })

    clientFetch.mockRejectedValueOnce(new Error("An unknown error occurred."))
    expect(await calculatePriceForShippingOption("so_other", "cart_1")).toEqual({ error: "other" })

    expect(log).toHaveBeenCalledTimes(2)
    expect(String(log.mock.calls[0][0])).toContain("so_cdek")
    log.mockRestore()
  })

  it("tells a place with no pickup point from a failed calculation (t-2026-10-14-58)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { calculatePriceForShippingOption } = await import("./fulfillment")

    clientFetch.mockRejectedValueOnce(
      new Error("cdek_no_points: В этом населённом пункте нет пунктов выдачи СДЭК")
    )
    expect(await calculatePriceForShippingOption("so_cdek_pvz", "cart_village")).toEqual({
      error: "no_points",
    })

    clientFetch.mockRejectedValueOnce(
      new Error("pochta_no_points: В этом населённом пункте нет пунктов выдачи Почты России")
    )
    expect(await calculatePriceForShippingOption("so_pochta", "cart_village")).toEqual({
      error: "no_points",
    })

    clientFetch.mockRejectedValueOnce(new Error("СДЭК не возит по этому адресу выбранным способом"))
    expect(await calculatePriceForShippingOption("so_cdek_courier", "cart_village")).toEqual({
      error: "other",
    })
    log.mockRestore()
  })

  // `next build` refuses a "use server" module that exports anything but async functions;
  // tsc and vitest do not, so an exported string constant here broke only the build.
  it("exports functions only, as a \"use server\" module must", async () => {
    const exported = await import("./fulfillment")

    for (const [name, value] of Object.entries(exported)) {
      expect(typeof value, name).toBe("function")
    }
  })
})
