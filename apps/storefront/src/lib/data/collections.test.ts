import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * stand-render-time (t-2026-10-12-33): one render of a page asks `listCollections()` from every
 * footer variant, hero M and the lead collection, 13 times on the template lab, and each call
 * probed every collection of the shop again (351 reads for 27 collections). React's `cache` keeps
 * one answer per request on the server and none outside a server render, so the test gives
 * `cache` a memo, the request one render would be.
 */
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
    const memo = new Map<string, R>()
    return (...args: A): R => {
      const key = JSON.stringify(args)
      if (!memo.has(key)) memo.set(key, fn(...args))
      return memo.get(key) as R
    }
  },
}))

const clientFetch = vi.fn()

vi.mock("@lib/config", () => ({
  sdk: { client: { fetch: (...args: unknown[]) => clientFetch(...args) } },
}))

vi.mock("./cookies", () => ({
  getCacheOptions: async (tag: string) => ({ tags: [tag] }),
  getTenantHandle: async () => "globex",
}))

vi.mock("./site-wide", () => ({
  siteWideRead: async (_label: string, run: () => unknown) => run(),
}))

const COLLECTIONS = [
  { id: "pcol_a", handle: "a" },
  { id: "pcol_b", handle: "b" },
  { id: "pcol_neighbour", handle: "neighbour" },
]

type Init = { query: Record<string, unknown> }

beforeEach(() => {
  clientFetch.mockReset().mockImplementation(async (path: string, { query }: Init) =>
    path === "/store/collections"
      ? { collections: COLLECTIONS, count: COLLECTIONS.length }
      : { products: query.collection_id === "pcol_neighbour" ? [] : [{ id: "prod_1" }] }
  )
})

describe("listCollections: the shop's own collections", () => {
  it("probes each collection once in a render, however many blocks ask, and keeps the same answer", async () => {
    const { listCollections } = await import("./collections")

    const answers = await Promise.all([
      listCollections(),
      listCollections(),
      listCollections({ fields: "id,handle,title" }),
    ])

    for (const { collections, count } of answers) {
      expect(collections.map((collection) => collection.handle)).toEqual(["a", "b"])
      expect(count).toBe(2)
    }
    const probes = clientFetch.mock.calls.filter(([path]) => path === "/store/products")
    expect(probes.map(([, init]) => (init as Init).query.collection_id).sort()).toEqual([
      "pcol_a",
      "pcol_b",
      "pcol_neighbour",
    ])
  })
})
