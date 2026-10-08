import { describe, expect, it } from "vitest"

import { categoryBranchIds } from "./category-tree"

describe("categoryBranchIds", () => {
  const categories = [
    { id: "hair", category_children: [{ id: "care" }, { id: "styling" }] },
    { id: "care", category_children: [{ id: "shampoo" }, { id: "mask" }] },
    { id: "styling", category_children: [] },
    { id: "shampoo", category_children: null },
    { id: "mask" },
    { id: "skin", category_children: [{ id: "cream" }] },
    { id: "cream" },
  ]

  it("answers the category and every level under it", () => {
    expect(categoryBranchIds("hair", categories)).toEqual(["hair", "care", "styling", "shampoo", "mask"])
    expect(categoryBranchIds("care", categories)).toEqual(["care", "shampoo", "mask"])
  })

  it("answers the category alone when it has no children or is not in the list", () => {
    expect(categoryBranchIds("mask", categories)).toEqual(["mask"])
    expect(categoryBranchIds("gone", categories)).toEqual(["gone"])
  })

  it("does not loop on a list that names a category under itself", () => {
    expect(categoryBranchIds("a", [{ id: "a", category_children: [{ id: "b" }] }, { id: "b", category_children: [{ id: "a" }] }])).toEqual(["a", "b"])
  })
})
