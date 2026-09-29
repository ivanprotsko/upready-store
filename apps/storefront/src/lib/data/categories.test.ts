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

type Served = { product_categories: ReturnType<typeof category>[] }

/**
 * `/store/tenant/product-categories` answers `response`; `/store/products`
 * (published, the storefront's own sales channel) answers `visible` when given,
 * and otherwise mirrors each category's own `products` relation, which is what
 * the A-13 cases below were written against.
 */
const serve = (
  response: Served,
  visible?: { id: string; categories: { id: string }[] }[]
) => {
  const products =
    visible ??
    response.product_categories.flatMap((c) =>
      (c.products as { id: string }[]).map((p) => ({ id: p.id, categories: [{ id: c.id }] }))
    )
  clientFetch.mockImplementation(async (path: string, init: { query?: Record<string, unknown> }) => {
    if (path !== "/store/products") {
      return response
    }
    const categoryIds = init.query?.category_id as string[] | undefined
    if (categoryIds) {
      return {
        products: [],
        count: products.filter((p) => p.categories.some((c) => categoryIds.includes(c.id))).length,
      }
    }
    return init.query?.fields === "id,categories.id"
      ? { products, count: products.length }
      : { products: [], count: products.length }
  })
}

const productsCalls = () =>
  clientFetch.mock.calls.filter(
    ([path, init]) => path === "/store/products" && init?.query?.fields === "id,categories.id"
  ).length

beforeEach(() => {
  clientFetch.mockReset()
})

describe("listCategories: A-13 empty-category filter", () => {
  it("drops a top-level leaf category with zero products", async () => {
    serve({
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
    serve({
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
    serve({
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
    serve({
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
    serve({
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

/**
 * U-17 (46df audit): after A-13 «Антисептики» stayed in olavka's header — its
 * one linked product is not published, and the category page (which lists
 * `/store/products`: published, the storefront's sales channel) was empty.
 * A category is in a menu only when that same route shows a product in it.
 */
describe("listCategories: U-17 only products the buyer can open count", () => {
  it("drops a category whose only linked product is not published or not in the channel", async () => {
    serve(
      {
        product_categories: [
          category({ id: "asd", handle: "asd", products: [{ id: "p-published" }] }),
          category({ id: "antiseptiki", handle: "antiseptiki", products: [{ id: "p-draft" }] }),
        ],
      },
      [{ id: "p-published", categories: [{ id: "asd" }] }]
    )
    const { listCategories } = await import("./categories")

    const result = await listCategories()

    expect(result.map((c) => c.handle)).toEqual(["asd"])
  })

  it("keeps a parent when only a child's product is published", async () => {
    serve(
      {
        product_categories: [
          category({
            id: "parent",
            handle: "parent",
            products: [],
            category_children: [
              { id: "child-good", handle: "child-good" },
              { id: "child-draft", handle: "child-draft" },
            ],
          }),
          category({ id: "child-good", handle: "child-good", parent_category_id: "parent", products: [{ id: "p1" }] }),
          category({ id: "child-draft", handle: "child-draft", parent_category_id: "parent", products: [{ id: "p2" }] }),
        ],
      },
      [{ id: "p1", categories: [{ id: "child-good" }] }]
    )
    const { listCategories } = await import("./categories")

    const result = await listCategories()

    const parent = result.find((c) => c.handle === "parent")!
    expect(parent.category_children.map((c: { handle: string }) => c.handle)).toEqual(["child-good"])
    expect(result.map((c) => c.handle).sort()).toEqual(["child-good", "parent"])
  })

  it("asks /store/products once for the whole menu, not once per category", async () => {
    serve(
      {
        product_categories: [
          category({ id: "a", handle: "a", products: [{ id: "p1" }] }),
          category({ id: "b", handle: "b", products: [{ id: "p2" }] }),
          category({ id: "c", handle: "c", products: [{ id: "p3" }] }),
        ],
      },
      [
        { id: "p1", categories: [{ id: "a" }] },
        { id: "p2", categories: [{ id: "b" }] },
      ]
    )
    const { listCategories } = await import("./categories")

    const result = await listCategories()

    expect(result.map((c) => c.handle)).toEqual(["a", "b"])
    expect(productsCalls()).toBe(1)
  })

  it("the H5/H6 chip row drops a top category with no product the buyer can open", async () => {
    serve(
      {
        product_categories: [
          category({ id: "asd", handle: "asd", name: "АСД" }),
          category({ id: "antiseptiki", handle: "antiseptiki", name: "Антисептики" }),
        ],
      },
      [{ id: "p-published", categories: [{ id: "asd" }] }]
    )
    const { listTopCategoriesWithCounts } = await import("./categories")

    const { categories } = await listTopCategoriesWithCounts()

    expect(categories.map((c) => c.handle)).toEqual(["asd"])
    expect(categories[0].count).toBe(1)
  })

  it("a failed /store/products read falls back to the categories' own products, never an empty menu", async () => {
    const response = {
      product_categories: [
        category({ id: "shoes", handle: "shoes", products: [{ id: "p1" }] }),
        category({ id: "empty", handle: "empty", products: [] }),
      ],
    }
    clientFetch.mockImplementation(async (path: string) => {
      if (path === "/store/products") {
        throw new Error("backend down")
      }
      return response
    })
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const { listCategories } = await import("./categories")

    const result = await listCategories()

    expect(result.map((c) => c.handle)).toEqual(["shoes"])
    error.mockRestore()
  })
})
