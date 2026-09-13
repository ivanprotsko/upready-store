import { describe, expect, it } from "vitest"

import { entryTargetPath } from "./entry-target"

describe("entryTargetPath", () => {
  it("opens the catalog when there is no or an unknown parameter", () => {
    expect(entryTargetPath(undefined)).toBe("/store")
    expect(entryTargetPath("")).toBe("/store")
    expect(entryTargetPath("ferrite")).toBe("/store")
    expect(entryTargetPath("order_123")).toBe("/store")
  })
  it("deep-links a product, category, collection or the cart", () => {
    expect(entryTargetPath("product_cube-set")).toBe("/products/cube-set")
    expect(entryTargetPath("category_spheres")).toBe("/categories/spheres")
    expect(entryTargetPath("collection_new_arrivals")).toBe("/collections/new_arrivals")
    expect(entryTargetPath("cart")).toBe("/cart")
  })
  it("never builds a path from a handle it would not trust", () => {
    expect(entryTargetPath("product_../admin")).toBe("/store")
    expect(entryTargetPath("product_")).toBe("/store")
    expect(entryTargetPath("product_A B")).toBe("/store")
  })
})
