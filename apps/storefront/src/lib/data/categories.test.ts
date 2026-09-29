import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * A-13 (46df audit): "Стимуляторы" (`stimulyatory-cherkashino`) sat in the
 * header and footer menus of a live shop with zero published products behind
 * it — a menu link promising a catalog that answers `count: 0`. Products
 * attach to LEAF categories, not parents (the same assumption
 * `listTopCategoriesWithCounts`'s own subtree count makes), so the fix has to
 * walk the tree rather than check each category's own `products` in
 * isolation — a parent whose own relation is empty by design must stay if any
 * child still has stock.
 */

const clientFetch = vi.fn()

vi.mock("@lib/config", () => ({
  sdk: { client: { fetch: (...args: unknown[]) => clientFetch(...args) } },
}))

vi.mock("./cookies", () => ({
  getCacheOptions: async (tag: string) => ({ tags: [tag] }),
  getTenantHandle: async () => "acme",
}))

vi.mock("./site-wide", () => ({
  siteWideRead: async (_label: string, run: () => unknown) => run(),
}))

const category = (
  over: Partial<{
    id: string
    handle: string
    name: string
    parent_category_id: string | null
    category_children: unknown[]
    products: unknown[]
  }> = {}
) => ({
  id: "cat_1",
  handle: "cat",
  name: "Category",
  parent_category_id: null,
  category_children: [],
  products: [],
  ...over,
})

beforeEach(() => {
  clientFetch.mockReset()
})

describe("listCategories: A-13 empty-category filter", () => {
  it("drops a top-level leaf category with zero products", async () => {
    clientFetch.mockResolvedValue({
      product_categories: [
        category({ id: "shoes", handle: "shoes", products: [{ id: "p1" }] }),
        category({ id: "stimulyatory", handle: "stimulyatory", products: [] }),
      ],
    })
    const { listCategories } = await import("./categories")

    const result = await listCategories()

    expect(result.map((c) => c.handle)).toEqual(["shoes"])
  })

  it("keeps a parent whose own products are empty but a child has stock", async () => {
    clientFetch.mockResolvedValue({
      product_categories: [
        category({
          id: "parent",
          handle: "parent",
          products: [],
          category_children: [{ id: "child-good", handle: "child-good" }],
        }),
        category({
          id: "child-good",
          handle: "child-good",
          parent_category_id: "parent",
          products: [{ id: "p2" }],
        }),
      ],
    })
    const { listCategories } = await import("./categories")

    const result = await listCategories()

    // The flat array (every consumer's own top-level filter runs on top of
    // this, e.g. `footer/variants/f1.tsx`'s `!category.parent_category_id`) —
    // "child-good" survives here too, in its own right, same as "parent".
    expect(result.map((c) => c.handle).sort()).toEqual(["child-good", "parent"])
    const parent = result.find((c) => c.handle === "parent")!
    expect(parent.category_children.map((c: { handle: string }) => c.handle)).toEqual([
      "child-good",
    ])
  })

  it("drops a parent whose every child is also empty", async () => {
    clientFetch.mockResolvedValue({
      product_categories: [
        category({
          id: "parent",
          handle: "parent",
          products: [],
          category_children: [{ id: "child-empty", handle: "child-empty" }],
        }),
        category({
          id: "child-empty",
          handle: "child-empty",
          parent_category_id: "parent",
          products: [],
        }),
      ],
    })
    const { listCategories } = await import("./categories")

    const result = await listCategories()

    expect(result).toEqual([])
  })

  it("prunes an empty child out of category_children without dropping the parent", async () => {
    clientFetch.mockResolvedValue({
      product_categories: [
        category({
          id: "parent",
          handle: "parent",
          products: [],
          category_children: [
            { id: "child-good", handle: "child-good" },
            { id: "child-empty", handle: "child-empty" },
          ],
        }),
        category({
          id: "child-good",
          handle: "child-good",
          parent_category_id: "parent",
          products: [{ id: "p3" }],
        }),
        category({
          id: "child-empty",
          handle: "child-empty",
          parent_category_id: "parent",
          products: [],
        }),
      ],
    })
    const { listCategories } = await import("./categories")

    const result = await listCategories()

    expect(result[0].category_children.map((c: { handle: string }) => c.handle)).toEqual([
      "child-good",
    ])
  })

  it("does not filter a call that never asked for products", async () => {
    clientFetch.mockResolvedValue({
      product_categories: [
        category({ id: "a", handle: "a", products: [] }),
        category({ id: "b", handle: "b", products: [] }),
      ],
    })
    const { listCategories } = await import("./categories")

    const result = await listCategories({ fields: "id,handle" })

    expect(result.map((c) => c.handle)).toEqual(["a", "b"])
  })
})
