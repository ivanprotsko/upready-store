import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * t-2026-10-12-32: `getAuthHeaders()` answers `{}` for a guest, `{}` is truthy,
 * so `if (!authHeaders) return null` never fired. Every guest page sent
 * `GET /store/customers/me`, waited about 215 ms for a 401 and did not cache
 * it. The four calls only a logged-in customer can make now ask `hasSession`
 * first; the variant read, which answers a guest, still goes out.
 *
 * `./cookies` is the real module, reading the `_medusa_jwt` cookie below.
 */

let jwt: string | undefined
const clientFetch = vi.fn()

vi.mock("server-only", () => ({}))

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) =>
      name === "_medusa_jwt" && jwt ? { value: jwt } : undefined,
  }),
}))

vi.mock("@lib/config", () => ({
  sdk: { client: { fetch: (...args: unknown[]) => clientFetch(...args) } },
}))

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("./locale-actions", () => ({ getLocale: async () => "ru" }))

/** What the backend answers a request without a session. */
const unauthorized = () =>
  Object.assign(new Error("Unauthorized"), { status: 401 })

const review = {
  product_id: "prod_1",
  rating: 5,
  body: "Хорошо",
  author_name: "Аня",
}

beforeEach(() => {
  jwt = undefined
  clientFetch.mockReset()
})

describe("a guest, with no _medusa_jwt cookie", () => {
  it("retrieveCustomer answers null without a call, as the 401 did", async () => {
    const { retrieveCustomer } = await import("./customer")

    await expect(retrieveCustomer()).resolves.toBeNull()
    expect(clientFetch).not.toHaveBeenCalled()
  })

  it("retrieveCustomerAddresses answers null without a call", async () => {
    const { retrieveCustomerAddresses } = await import("./customer")

    await expect(retrieveCustomerAddresses()).resolves.toBeNull()
    expect(clientFetch).not.toHaveBeenCalled()
  })

  it("claimGuestOrders says unauthorized without a call", async () => {
    const { claimGuestOrders } = await import("./orders")

    await expect(claimGuestOrders()).resolves.toEqual({
      claimed: null,
      error: "unauthorized",
    })
    expect(clientFetch).not.toHaveBeenCalled()
  })

  it("submitProductReview refuses without a call", async () => {
    const { submitProductReview } = await import("./product-reviews")

    await expect(submitProductReview(review)).resolves.toEqual({
      ok: false,
      error: "unauthorized",
    })
    expect(clientFetch).not.toHaveBeenCalled()
  })

  it("retrieveVariant still reads the variant, with no authorization header", async () => {
    clientFetch.mockResolvedValue({ variant: { id: "variant_1" } })
    const { retrieveVariant } = await import("./variants")

    await expect(retrieveVariant("variant_1")).resolves.toEqual({
      id: "variant_1",
    })
    expect(clientFetch).toHaveBeenCalledTimes(1)
    expect(clientFetch.mock.calls[0][0]).toBe("/store/product-variants/variant_1")
    expect(clientFetch.mock.calls[0][1].headers).toEqual({})
  })
})

describe("the answers a guest got before, from the 401", () => {
  beforeEach(() => {
    jwt = "expired"
    clientFetch.mockRejectedValue(unauthorized())
  })

  it("retrieveCustomer and retrieveCustomerAddresses answered null", async () => {
    const { retrieveCustomer, retrieveCustomerAddresses } = await import(
      "./customer"
    )

    await expect(retrieveCustomer()).resolves.toBeNull()
    await expect(retrieveCustomerAddresses()).resolves.toBeNull()
  })

  it("claimGuestOrders answered no number and an error, which the form shows as failed", async () => {
    const { claimGuestOrders } = await import("./orders")
    vi.spyOn(console, "error").mockImplementation(() => {})

    const state = await claimGuestOrders()

    expect(state.claimed).toBeNull()
    expect(state.error).toBeTruthy()
  })

  it("submitProductReview answered not ok, which the form shows as its error", async () => {
    const { submitProductReview } = await import("./product-reviews")
    vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(submitProductReview(review)).resolves.toMatchObject({
      ok: false,
    })
  })
})

describe("a logged-in customer, with a _medusa_jwt cookie", () => {
  const bearer = { authorization: "Bearer jwt_1" }

  beforeEach(() => {
    jwt = "jwt_1"
  })

  it("retrieveCustomer sends the token to /store/customers/me", async () => {
    clientFetch.mockResolvedValue({ customer: { id: "cus_1" } })
    const { retrieveCustomer } = await import("./customer")

    await expect(retrieveCustomer()).resolves.toEqual({ id: "cus_1" })
    expect(clientFetch).toHaveBeenCalledWith(
      "/store/customers/me",
      expect.objectContaining({ headers: bearer })
    )
  })

  it("retrieveCustomerAddresses sends the token", async () => {
    clientFetch.mockResolvedValue({ addresses: [{ id: "addr_1" }] })
    const { retrieveCustomerAddresses } = await import("./customer")

    await expect(retrieveCustomerAddresses()).resolves.toEqual([
      { id: "addr_1" },
    ])
    expect(clientFetch).toHaveBeenCalledWith(
      "/store/customers/me/addresses",
      expect.objectContaining({ headers: bearer })
    )
  })

  it("claimGuestOrders sends the token", async () => {
    clientFetch.mockResolvedValue({ claimed: 0 })
    const { claimGuestOrders } = await import("./orders")

    await expect(claimGuestOrders()).resolves.toEqual({
      claimed: 0,
      error: null,
    })
    expect(clientFetch).toHaveBeenCalledWith(
      "/store/customers/me/claim-orders",
      expect.objectContaining({ method: "POST", headers: bearer })
    )
  })

  it("submitProductReview sends the token", async () => {
    clientFetch.mockResolvedValue({})
    const { submitProductReview } = await import("./product-reviews")

    await expect(submitProductReview(review)).resolves.toEqual({ ok: true })
    expect(clientFetch).toHaveBeenCalledWith(
      "/store/tenant/reviews",
      expect.objectContaining({ method: "POST", headers: bearer })
    )
  })

  it("retrieveVariant sends the token too", async () => {
    clientFetch.mockResolvedValue({ variant: { id: "variant_1" } })
    const { retrieveVariant } = await import("./variants")

    await retrieveVariant("variant_1")

    expect(clientFetch.mock.calls[0][1].headers).toEqual(bearer)
  })
})
