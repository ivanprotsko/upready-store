import { afterEach, describe, expect, it, vi } from "vitest"

import { describeReadFailure, isNoShopError, siteWideRead } from "./site-wide"

/**
 * The regression this file holds: a request that cannot name a shop gets
 * `400 Publishable API key required` from every `/store/*` route, and the
 * site-wide chrome used to rethrow it, which replaced the page with
 * `Application error` — on the order confirmation that meant a stack trace at
 * the moment the customer's card was charged (t01-checkout-thankyou).
 */

const noShop = Object.assign(
  new Error(
    "Publishable API key required in the request header: x-publishable-api-key. " +
      "You can manage your keys in settings in the dashboard."
  ),
  { status: 400 }
)

afterEach(() => {
  vi.restoreAllMocks()
})

describe("isNoShopError", () => {
  it("recognises the Store API's keyless 400", () => {
    expect(isNoShopError(noShop)).toBe(true)
  })

  it("does not claim every 400, nor the 404 the tenant route answers", () => {
    expect(isNoShopError(Object.assign(new Error("Invalid limit"), { status: 400 }))).toBe(false)
    expect(isNoShopError(Object.assign(new Error("Not found"), { status: 404 }))).toBe(false)
  })

  it("survives a thrown value that is not an error object", () => {
    expect(isNoShopError(undefined)).toBe(false)
    expect(isNoShopError("boom")).toBe(false)
  })
})

describe("describeReadFailure", () => {
  it("names the Host chain for the keyless 400, not just the API's own words", () => {
    const described = describeReadFailure(noShop)

    expect(described).toContain("Host")
    expect(described).toContain("/storefront/by-host")
    expect(described).toContain("x-tenant-key")
  })

  it("passes any other failure through with its status", () => {
    expect(
      describeReadFailure(Object.assign(new Error("upstream down"), { status: 503 }))
    ).toBe("503: upstream down")
  })
})

describe("siteWideRead", () => {
  it("returns the read's own answer when it succeeds", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(siteWideRead("nav", async () => ["a"], null)).resolves.toEqual(["a"])
    expect(error).not.toHaveBeenCalled()
  })

  it("does not throw into the layout render, and reports by name", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(
      siteWideRead("listCategories /store/tenant/product-categories", async () => {
        throw noShop
      }, null)
    ).resolves.toBeNull()

    expect(error).toHaveBeenCalledTimes(1)
    expect(String(error.mock.calls[0]?.[0])).toContain(
      "listCategories /store/tenant/product-categories"
    )
    expect(String(error.mock.calls[0]?.[0])).toContain("/storefront/by-host")
  })

  it("hands back the caller's own fallback, so a failure stays distinguishable from an empty shop", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(
      siteWideRead("listRegions /store/regions", async () => {
        throw noShop
      }, [])
    ).resolves.toEqual([])
  })
})
