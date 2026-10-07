import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * t-2026-10-08-13, part A7: the sitemap of a live shop listed 10 categories
 * where its menu showed 9. The tenth had no card a buyer can open: the menu
 * leaves such a category out (`lib/data/categories.ts`, U-17), and the sitemap
 * read categories with a query of its own that knew nothing of the rule.
 */

const BASE = "https://shop.example"

const state = {
  categories: [] as Record<string, unknown>[],
  visible: [] as { id: string; categories: { id: string }[] }[],
  visibleFails: false,
}

const categoryQueries: Record<string, unknown>[] = []

vi.mock("@lib/config", () => ({
  fetchWithoutLocale: async () => ({ pages: [] }),
  sdk: {
    client: {
      fetch: async (path: string, init?: { query?: Record<string, unknown> }) => {
        if (path === "/store/products") {
          if (init?.query?.fields === "id,categories.id") {
            if (state.visibleFails) throw new Error("products read failed")
            return { products: state.visible, count: state.visible.length }
          }
          return { products: [], count: 0 }
        }
        if (path === "/store/tenant/product-categories") {
          categoryQueries.push(init?.query ?? {})
          return { product_categories: state.categories }
        }
        if (path === "/store/tenant/collections") {
          return { collections: [] }
        }
        throw new Error(`unexpected path ${path}`)
      },
    },
  },
}))

vi.mock("@lib/data/cookies", () => ({
  getRequestBaseURL: async () => BASE,
  getTenantHandle: async () => "acme",
  getEnabledLocales: async () => ["ru"],
  getCacheOptions: async (tag: string) => ({ tags: [tag] }),
}))

vi.mock("@lib/data/site-wide", () => ({
  siteWideRead: async (_label: string, run: () => unknown) => run(),
}))

vi.mock("@lib/data/tenant-articles", () => ({
  listTenantArticles: async () => ({ articles: [], count: 0 }),
}))

const category = (id: string, children: string[] = []) => ({
  id: `pcat_${id}`,
  handle: id,
  updated_at: "2026-10-01T00:00:00.000Z",
  category_children: children.map((child) => ({ id: `pcat_${child}`, handle: child })),
})

const categoryUrls = async () => {
  const { default: sitemap } = await import("./sitemap")
  return (await sitemap()).map((entry) => entry.url).filter((url) => url.includes("/categories/"))
}

beforeEach(() => {
  categoryQueries.length = 0
  state.categories = [category("tea"), category("honey")]
  state.visible = [{ id: "prod_1", categories: [{ id: "pcat_tea" }] }]
  state.visibleFails = false
})

describe("sitemap: categories follow the menu's rule", () => {
  it("leaves out a category with no card a buyer can open", async () => {
    expect(await categoryUrls()).toEqual([`${BASE}/ru/categories/tea`])
  })

  it("keeps a parent with no card of its own while a child has one", async () => {
    state.categories = [category("drinks", ["tea"]), category("tea"), category("honey")]

    expect(await categoryUrls()).toEqual([
      `${BASE}/ru/categories/drinks`,
      `${BASE}/ru/categories/tea`,
    ])
  })

  it("lists every category, as before, when the product read fails", async () => {
    state.visibleFails = true

    expect(await categoryUrls()).toEqual([
      `${BASE}/ru/categories/tea`,
      `${BASE}/ru/categories/honey`,
    ])
  })

  it("lists no category of a shop with no published product", async () => {
    state.visible = []

    expect(await categoryUrls()).toEqual([])
  })

  it("asks the shop's own route for what the rule reads", async () => {
    await categoryUrls()

    expect(categoryQueries).toEqual([
      { fields: "id,handle,updated_at,*category_children", limit: 500 },
    ])
  })
})
