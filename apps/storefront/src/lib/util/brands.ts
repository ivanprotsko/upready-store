import type { HttpTypes } from "@medusajs/types"

/**
 * A shop's brands (ask a0e1, t-2026-10-06-09) are the children of its category with this
 * handle: a brand is a category, so its page, its products, its picture and its place in
 * the panel are the ones every category already has. A shop with no such category has no
 * brands, and neither the home block nor `/brands` exists for it.
 */
export const BRANDS_CATEGORY_HANDLE = "brands"

type Category = HttpTypes.StoreProductCategory

/** The brands of a shop out of its category list, in the owner's order, then by name. */
export function brandsOf(categories: readonly Category[]): Category[] {
  const root = categories.find(
    (category) => category.handle === BRANDS_CATEGORY_HANDLE && !category.parent_category_id
  )

  if (!root) {
    return []
  }

  const byId = new Map(categories.map((category) => [category.id, category]))

  return (root.category_children ?? [])
    .map((child) => byId.get(child.id) ?? child)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || a.name.localeCompare(b.name))
}
