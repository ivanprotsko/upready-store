import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * t-2026-10-04-48. After Ivan's Robokassa test the live RU cart
 * `cart_01M42J47P9ST5NJYMB4JBHDWKF` held `checkout_consent` and nothing else:
 * the consent box wrote `{ ...cart.metadata, checkout_consent }` from a cart the
 * page had rendered before the contacts were saved, Medusa replaced the column
 * whole, and the buyer came back to an empty contacts step. `updateCart` now
 * merges each patch into the metadata the backend holds at that moment.
 */

const clientFetch = vi.fn()
const cartUpdate = vi.fn()
const cartComplete = vi.fn()
const removeCartId = vi.fn()
let cartIdCookie: string | undefined = "cart_1"

vi.mock("server-only", () => ({}))

vi.mock("@lib/config", () => ({
  sdk: {
    client: { fetch: (...args: unknown[]) => clientFetch(...args) },
    store: {
      cart: {
        update: (...args: unknown[]) => cartUpdate(...args),
        complete: (...args: unknown[]) => cartComplete(...args),
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
  getCartId: async () => cartIdCookie,
  getCountryCode: async () => "ru",
  removeCartId: (...args: unknown[]) => removeCartId(...args),
  setCartId: vi.fn(),
  setCountryCode: vi.fn(),
}))

vi.mock("./regions", () => ({ getRegion: async () => ({ id: "reg_ru" }) }))
vi.mock("./locale-actions", () => ({ getLocale: async () => "ru" }))

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

const CONTACTS = {
  contact_first_name: "Иван",
  contact_last_name: "Тестов",
  contact_phone: "+70000000000",
  has_different_recipient: "false",
}

/** The backend as the merge sees it: one stored metadata, read by id. */
const backendHolds = (metadata: Record<string, unknown> | null) => {
  clientFetch.mockImplementation(async (url: string, init?: { query?: { fields?: string } }) => {
    if (url === "/store/carts/cart_1" && init?.query?.fields === "id,metadata") {
      return { cart: { id: "cart_1", metadata } }
    }
    throw new Error(`unexpected ${url}`)
  })
  cartUpdate.mockImplementation(async (_id: string, data: unknown) => ({ cart: { id: "cart_1", ...(data as object) } }))
}

const written = () => cartUpdate.mock.calls.at(-1)?.[1] as { metadata?: Record<string, unknown> }

beforeEach(() => {
  clientFetch.mockReset()
  cartUpdate.mockReset()
  cartComplete.mockReset()
  removeCartId.mockReset()
  cartIdCookie = "cart_1"
})

describe("updateCart: metadata is a patch over what the backend holds", () => {
  it("keeps every contact_* key when the consent record is written", async () => {
    backendHolds({ ...CONTACTS })
    const { updateCart } = await import("./cart")

    await updateCart({ metadata: { checkout_consent: { text_version: "v" } } })

    expect(written().metadata).toEqual({
      ...CONTACTS,
      checkout_consent: { text_version: "v" },
    })
  })

  it("keeps the consent record and the pickup point when the contacts are written", async () => {
    backendHolds({
      checkout_consent: { text_version: "v" },
      pickup_point_name: "ПВЗ на Ленина",
    })
    const { updateCart } = await import("./cart")

    await updateCart({ metadata: { ...CONTACTS } })

    expect(written().metadata).toEqual({
      checkout_consent: { text_version: "v" },
      pickup_point_name: "ПВЗ на Ленина",
      ...CONTACTS,
    })
  })

  it("lets the patch change its own keys", async () => {
    backendHolds({ ...CONTACTS })
    const { updateCart } = await import("./cart")

    await updateCart({ metadata: { contact_phone: "+71111111111" } })

    expect(written().metadata).toEqual({ ...CONTACTS, contact_phone: "+71111111111" })
  })

  it("writes nothing when the current metadata cannot be read, rather than erase it", async () => {
    clientFetch.mockRejectedValue(Object.assign(new Error("Not Found"), { status: 404 }))
    const { updateCart } = await import("./cart")

    await expect(
      updateCart({ metadata: { checkout_consent: { text_version: "v" } } })
    ).rejects.toThrow()
    expect(cartUpdate).not.toHaveBeenCalled()
  })

  it("does not read the cart for a write without metadata", async () => {
    cartUpdate.mockResolvedValue({ cart: { id: "cart_1" } })
    const { updateCart } = await import("./cart")

    await updateCart({ email: "buyer@example.com" })

    expect(clientFetch).not.toHaveBeenCalled()
    expect(written()).toEqual({ email: "buyer@example.com" })
  })
})

describe("checkPaymentReturn: one look from the Robokassa waiting page", () => {
  it("answers the confirmation page once the cart is an order", async () => {
    cartComplete.mockResolvedValue({
      type: "order",
      order: { id: "order_1" },
      order_token: "tok en",
    })
    const { checkPaymentReturn } = await import("./cart")

    await expect(checkPaymentReturn()).resolves.toEqual({
      status: "order",
      href: "/ru/order/order_1/confirmed?token=tok%20en",
    })
    expect(cartComplete).toHaveBeenCalledWith("cart_1", {}, {})
    expect(removeCartId).toHaveBeenCalled()
  })

  it("answers pending while the payment is not confirmed (the backend refuses to complete)", async () => {
    cartComplete.mockRejectedValue(new Error("Payment authorization failed"))
    const { checkPaymentReturn } = await import("./cart")

    await expect(checkPaymentReturn()).resolves.toEqual({ status: "pending" })
    expect(removeCartId).not.toHaveBeenCalled()
  })

  it("answers pending for a completion that returns the cart unchanged", async () => {
    cartComplete.mockResolvedValue({ type: "cart", cart: { id: "cart_1" } })
    const { checkPaymentReturn } = await import("./cart")

    await expect(checkPaymentReturn()).resolves.toEqual({ status: "pending" })
  })

  it("answers no_cart without asking the backend when there is no cart cookie", async () => {
    cartIdCookie = undefined
    const { checkPaymentReturn } = await import("./cart")

    await expect(checkPaymentReturn()).resolves.toEqual({ status: "no_cart" })
    expect(cartComplete).not.toHaveBeenCalled()
  })
})
