import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * A-15 (46df audit): catalog reads had no ceiling on their `force-cache` tag —
 * a dropped revalidation webhook (`notifyStorefrontRevalidate`, retried since
 * this same task, but never guaranteed) left a stale price or an out-of-stock
 * item on the shelf forever, with nothing else that would ever clear it.
 * `next.revalidate: 3600` is the fallback, not the ordinary path: the tag
 * still clears within seconds on a normal write.
 */

const clientFetch = vi.fn()

vi.mock("@lib/config", () => ({
  sdk: { client: { fetch: (...args: unknown[]) => clientFetch(...args) } },
}))

vi.mock("./cookies", () => ({
  getAuthHeaders: async () => ({}),
  getCacheOptions: async (tag: string) => ({ tags: [tag] }),
  getCacheTag: async (tag: string) => tag,
  getCountryCode: async () => "us",
  getTenantHandle: async () => null,
}))

vi.mock("./regions", () => ({
  getRegion: async () => ({ id: "reg_1", countries: [{ iso_2: "us" }] }),
  retrieveRegion: async () => ({ id: "reg_1" }),
}))

vi.mock("./site-wide", () => ({
  siteWideRead: async (_label: string, run: () => unknown) => run(),
}))

const fetchOptions = () => clientFetch.mock.calls[0]?.[1] as { next?: Record<string, unknown> }

beforeEach(() => {
  clientFetch.mockReset()
})

describe("listProducts: revalidate ceiling", () => {
  it("carries next.revalidate 3600 besides the cache tag", async () => {
    clientFetch.mockResolvedValue({ products: [], count: 0 })
    const { listProducts } = await import("./products")

    await listProducts({ countryCode: "us" })

    expect(fetchOptions().next).toEqual(
      expect.objectContaining({ tags: ["products"], revalidate: 3600 })
    )
  })
})

describe("listCollections: revalidate ceiling", () => {
  it("carries next.revalidate 3600 besides the cache tag", async () => {
    clientFetch.mockResolvedValue({ collections: [], count: 0 })
    const { listCollections } = await import("./collections")

    await listCollections()

    expect(fetchOptions().next).toEqual(
      expect.objectContaining({ tags: ["collections"], revalidate: 3600 })
    )
  })
})

describe("retrieveVariant: revalidate ceiling", () => {
  it("carries next.revalidate 3600 besides the cache tag", async () => {
    clientFetch.mockResolvedValue({ variant: { id: "variant_1" } })
    const { retrieveVariant } = await import("./variants")

    await retrieveVariant("variant_1")

    expect(fetchOptions().next).toEqual(
      expect.objectContaining({ tags: ["variants"], revalidate: 3600 })
    )
  })
})

describe("listProductAttributes: revalidate ceiling", () => {
  it("carries next.revalidate 3600 besides the cache tag", async () => {
    clientFetch.mockResolvedValue({ product_attributes: [] })
    const { listProductAttributes } = await import("./product-attributes")

    await listProductAttributes("prod_1")

    expect(fetchOptions().next).toEqual(
      expect.objectContaining({ tags: ["product-attributes"], revalidate: 3600 })
    )
  })
})
