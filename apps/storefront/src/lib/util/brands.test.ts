import type { HttpTypes } from "@medusajs/types"
import { describe, expect, it } from "vitest"

import { brandsOf } from "./brands"

type Category = HttpTypes.StoreProductCategory

const category = (fields: Partial<Category> & { id: string; handle: string }): Category =>
  ({ name: fields.handle, rank: 0, parent_category_id: null, category_children: [], ...fields }) as Category

describe("brandsOf", () => {
  const lebel = category({ id: "c2", handle: "lebel", name: "Lebel", rank: 1, parent_category_id: "c1", metadata: { image_url: "/l.svg" } })
  const milbon = category({ id: "c3", handle: "milbon", name: "Milbon", rank: 0, parent_category_id: "c1" })
  const brands = category({
    id: "c1",
    handle: "brands",
    category_children: [{ id: "c2", handle: "lebel", name: "Lebel", rank: 1 } as Category, { id: "c3", handle: "milbon", name: "Milbon", rank: 0 } as Category],
  })

  it("answers the children of the `brands` category in the owner's order, with their own fields", () => {
    const found = brandsOf([category({ id: "c0", handle: "hair" }), brands, lebel, milbon])

    expect(found.map((brand) => brand.handle)).toEqual(["milbon", "lebel"])
    expect(found[1].metadata).toEqual({ image_url: "/l.svg" })
  })

  it("keeps a child the list itself did not reach", () => {
    expect(brandsOf([brands]).map((brand) => brand.handle)).toEqual(["milbon", "lebel"])
  })

  it("answers nothing for a shop with no such category, or with one that is not a root", () => {
    expect(brandsOf([category({ id: "c0", handle: "hair" })])).toEqual([])
    expect(brandsOf([category({ id: "c9", handle: "brands", parent_category_id: "c0", category_children: [lebel] })])).toEqual([])
  })

  it("takes the seeded root `brands-<shop>` of this shop, and no other shop's", () => {
    const seeded = { ...brands, handle: "brands-bpj" } as Category

    expect(brandsOf([seeded, lebel, milbon], "bpj").map((brand) => brand.handle)).toEqual(["milbon", "lebel"])
    expect(brandsOf([seeded, lebel, milbon], "other")).toEqual([])
    expect(brandsOf([seeded, lebel, milbon])).toEqual([])
    expect(brandsOf([seeded, lebel, milbon], null)).toEqual([])
  })
})
