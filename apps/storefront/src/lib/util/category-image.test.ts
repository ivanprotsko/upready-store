import { describe, expect, it } from "vitest"

import { categoriesWithImages, categoryImage } from "./category-image"

const IMG = "https://shipshift.dev/static/tenants/ten_1/photo.png"

describe("categoryImage", () => {
  it("reads the two keys the tenant panel writes", () => {
    expect(
      categoryImage({ metadata: { image_url: IMG, image_alt: "Флаконы АСД" } })
    ).toEqual({ url: IMG, alt: "Флаконы АСД" })
  })

  it("treats a cleared, blank or absent address as no picture", () => {
    expect(categoryImage({ metadata: { image_url: null } }).url).toBeNull()
    expect(categoryImage({ metadata: { image_url: "   " } }).url).toBeNull()
    expect(categoryImage({ metadata: {} }).url).toBeNull()
    expect(categoryImage({}).url).toBeNull()
    expect(categoryImage({ metadata: null }).url).toBeNull()
  })

  it("gives decorative art an empty alt rather than undefined", () => {
    expect(categoryImage({ metadata: { image_url: IMG } }).alt).toBe("")
    expect(categoryImage({ metadata: { image_url: IMG, image_alt: 7 } }).alt).toBe("")
  })
})

describe("categoriesWithImages", () => {
  const withImage = (id: string, rank: number, children: { id: string }[] = []) => ({
    id,
    rank,
    category_children: children,
    metadata: { image_url: `${IMG}#${id}` },
  })
  const without = (id: string, rank: number, children: { id: string }[] = []) => ({
    id,
    rank,
    category_children: children,
    metadata: {},
  })

  it("draws a block from ONE picture — the f16 defect was a floor of three", () => {
    const picked = categoriesWithImages([without("a", 0), withImage("b", 1)], 6)
    expect(picked.map((c) => c.id)).toEqual(["b"])
  })

  it("keeps the starter catalogs on leaves when a leaf carries a picture", () => {
    const leaf = withImage("leaf", 1)
    const root = withImage("root", 0, [{ id: "leaf" }])
    expect(categoriesWithImages([root, leaf], 6).map((c) => c.id)).toEqual(["leaf"])
  })

  it("falls back to a pictured parent when no leaf has one", () => {
    const root = withImage("root", 0, [{ id: "leaf" }])
    expect(categoriesWithImages([root, without("leaf", 1)], 6).map((c) => c.id)).toEqual([
      "root",
    ])
  })

  it("orders by rank and honours the limit", () => {
    const picked = categoriesWithImages(
      [withImage("c", 3), withImage("a", 1), withImage("b", 2)],
      2
    )
    expect(picked.map((c) => c.id)).toEqual(["a", "b"])
  })

  it("is empty for a shop where nobody uploaded anything", () => {
    expect(categoriesWithImages([without("a", 0), without("b", 1)], 6)).toEqual([])
  })
})
