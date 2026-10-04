import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * t-2026-10-04-23: a buyer adds a physical product, picks DHL, then removes the
 * product. The cart kept the DHL method, so the course «Очищение печени» reached
 * payment as 18 900 + 3 500 ₽ and place-order failed with «Что-то пошло не так»
 * (stand `cart_01M3YKC6VAKK5CEY2AM5E2CGKF`, 2026-10-04). Removing the last
 * physical line through the cart queue now asks the backend to drop the method,
 * and the reply carries the cart without it.
 */

const clientFetch = vi.fn()
const deleteLineItem = vi.fn()

vi.mock("server-only", () => ({}))

vi.mock("@lib/config", () => ({
  sdk: {
    client: { fetch: (...args: unknown[]) => clientFetch(...args) },
    store: {
      cart: {
        deleteLineItem: (...args: unknown[]) => deleteLineItem(...args),
        createLineItem: vi.fn(),
        updateLineItem: vi.fn(),
      },
    },
  },
}))

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn(), unstable_rethrow: vi.fn() }))

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

const COURSE = {
  id: "item_course",
  variant_id: "var_course",
  quantity: 1,
  requires_shipping: true,
  product: { metadata: { digital: "true" } },
}
const KETTLE = {
  id: "item_kettle",
  variant_id: "var_kettle",
  quantity: 1,
  requires_shipping: true,
  product: { metadata: null },
}
const DHL = { id: "casm_dhl", amount: 3500, name: "DHL" }

/** The backend's carts, read in order: before the change, after it, after the drop. */
const backend = (carts: unknown[], drop: () => Promise<unknown> = async () => ({})) => {
  const reads = [...carts]
  clientFetch.mockImplementation(async (url: string, init?: { method?: string }) => {
    if (url === "/store/carts/cart_1/drop-shipping" && init?.method === "POST") {
      return drop()
    }
    if (url === "/store/carts/cart_1") {
      return { cart: reads.length > 1 ? reads.shift() : reads[0] }
    }
    throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`)
  })
}

const dropCalls = () =>
  clientFetch.mock.calls.filter(([url]) => url === "/store/carts/cart_1/drop-shipping")

describe("syncCartLines: removing the last physical item", () => {
  beforeEach(() => {
    clientFetch.mockReset()
    deleteLineItem.mockReset().mockResolvedValue({})
  })

  it("drops the stale DHL method and answers with the cart without it", async () => {
    backend([
      { id: "cart_1", items: [COURSE, KETTLE], shipping_methods: [DHL] },
      { id: "cart_1", items: [COURSE], shipping_methods: [DHL] },
      { id: "cart_1", items: [COURSE], shipping_methods: [] },
    ])
    const { syncCartLines } = await import("./cart-lines")

    const reply = await syncCartLines([{ variantId: "var_kettle", quantity: 0 }])

    expect(deleteLineItem).toHaveBeenCalledWith("cart_1", "item_kettle", { fields: "id" }, {})
    expect(dropCalls()).toHaveLength(1)
    expect(dropCalls()[0][1]).toMatchObject({ method: "POST" })
    expect(reply.cart?.shipping_methods).toEqual([])
    expect(reply.errors).toEqual([])
  })

  it("leaves the method on a cart that still ships something", async () => {
    backend([
      { id: "cart_1", items: [COURSE, KETTLE], shipping_methods: [DHL] },
      { id: "cart_1", items: [KETTLE], shipping_methods: [DHL] },
    ])
    const { syncCartLines } = await import("./cart-lines")

    const reply = await syncCartLines([{ variantId: "var_course", quantity: 0 }])

    expect(dropCalls()).toHaveLength(0)
    expect(reply.cart?.shipping_methods).toEqual([DHL])
  })

  it("keeps the cart as it is and logs the cart id when the backend refuses", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    backend(
      [
        { id: "cart_1", items: [COURSE, KETTLE], shipping_methods: [DHL] },
        { id: "cart_1", items: [COURSE], shipping_methods: [DHL] },
      ],
      async () => {
        throw new Error("Cart cart_1 holds an item that has to be shipped")
      }
    )
    const { syncCartLines } = await import("./cart-lines")

    const reply = await syncCartLines([{ variantId: "var_kettle", quantity: 0 }])

    expect(dropCalls()).toHaveLength(1)
    expect(reply.cart?.shipping_methods).toEqual([DHL])
    expect(log).toHaveBeenCalledWith(expect.stringContaining("cart_1"))
    log.mockRestore()
  })
})
