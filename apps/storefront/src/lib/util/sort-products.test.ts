import type { HttpTypes } from "@medusajs/types"
import { describe, expect, it } from "vitest"
import { sortProducts } from "./sort-products"

const product = (id: string, created: string, picture: boolean): HttpTypes.StoreProduct =>
  ({
    id,
    created_at: created,
    thumbnail: picture ? `https://img/${id}.webp` : null,
    images: [],
    variants: [{ calculated_price: { calculated_amount: 10 } }],
  }) as unknown as HttpTypes.StoreProduct

describe("sortProducts", () => {
  it("puts products without a picture after the rest, keeping the chosen order in each group", () => {
    const sorted = sortProducts(
      [
        product("old-photo", "2026-09-01", true),
        product("new-no-photo", "2026-09-15", false),
        product("mid-photo", "2026-09-10", true),
        product("old-no-photo", "2026-09-02", false),
      ],
      "created_at"
    )

    expect(sorted.map((p) => p.id)).toEqual(["mid-photo", "old-photo", "new-no-photo", "old-no-photo"])
  })

  it("counts a gallery image as a picture when there is no thumbnail", () => {
    const withImage = { ...product("gallery", "2026-09-15", false), images: [{ id: "img", url: "u" }] }
    const sorted = sortProducts(
      [product("none", "2026-09-20", false), withImage as HttpTypes.StoreProduct],
      "created_at"
    )

    expect(sorted.map((p) => p.id)).toEqual(["gallery", "none"])
  })

  it("puts products with no price in this region after everything else", () => {
    const unpriced = { ...product("no-price", "2026-09-30", true), variants: [{ calculated_price: null }] }
    const sorted = sortProducts(
      [unpriced as unknown as HttpTypes.StoreProduct, product("no-photo", "2026-09-01", false), product("ok", "2026-09-02", true)],
      "created_at"
    )

    expect(sorted.map((p) => p.id)).toEqual(["ok", "no-photo", "no-price"])
  })
})
