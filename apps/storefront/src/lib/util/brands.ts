import type { HttpTypes } from "@medusajs/types"

/**
 * A shop's brands (ask a0e1, t-2026-10-06-09) are the children of its category with this
 * handle: a brand is a category, so its page, its products, its picture and its place in
 * the panel are the ones every category already has. A shop with no such category has no
 * brands, and neither the home block nor `/brands` exists for it.
 *
 * A category handle is unique across the whole backend, so a seeded shop gets
 * `brands-<shop handle>` (`scopedHandle`, seed-tenant-dataset); both forms are its root.
 */
export const BRANDS_CATEGORY_HANDLE = "brands"

const isBrandsHandle = (handle: string | undefined, tenantHandle?: string | null): boolean =>
  handle === BRANDS_CATEGORY_HANDLE ||
  (Boolean(tenantHandle) && handle === `${BRANDS_CATEGORY_HANDLE}-${tenantHandle}`)

type Category = HttpTypes.StoreProductCategory

/** The brands of a shop out of its category list, in the owner's order, then by name. */
export function brandsOf(categories: readonly Category[], tenantHandle?: string | null): Category[] {
  const root = categories.find(
    (category) => isBrandsHandle(category.handle, tenantHandle) && !category.parent_category_id
  )

  if (!root) {
    return []
  }

  const byId = new Map(categories.map((category) => [category.id, category]))

  return (root.category_children ?? [])
    .map((child) => byId.get(child.id) ?? child)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || a.name.localeCompare(b.name))
}
