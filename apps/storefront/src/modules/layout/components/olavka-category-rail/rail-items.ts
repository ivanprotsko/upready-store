import type { HttpTypes } from "@medusajs/types"

import { categoryTint, type CategoryTint } from "./palette"

/** One button of the row: a top-level category, every handle that counts as being inside it, its tint. */
export type RailItem = {
  id: string
  name: string
  handle: string
  /** The category's own handle and those of all its descendants: a child's page lights its parent. */
  handles: string[]
  tint: CategoryTint
}

/**
 * The row's buttons: the shop's top-level categories in alphabetical order of the page's
 * language, as the frame CatalogNav lists them and as chrxnasdmds' `CategoryRail` sorts
 * them (`localeCompare(…, "ru")`), each with the tint of its place in that order.
 *
 * `categories` is `listCategories()`'s flat list, so a category without a product the buyer
 * can open is already gone (A-13, U-17) and the row never leads to an empty page.
 */
export function railItems(
  categories: HttpTypes.StoreProductCategory[],
  locale: string
): RailItem[] {
  const byParent = new Map<string, HttpTypes.StoreProductCategory[]>()
  for (const category of categories) {
    if (!category.parent_category_id) continue
    const siblings = byParent.get(category.parent_category_id) ?? []
    siblings.push(category)
    byParent.set(category.parent_category_id, siblings)
  }

  const handlesUnder = (category: HttpTypes.StoreProductCategory, seen: Set<string>): string[] => {
    if (seen.has(category.id)) return []
    seen.add(category.id)
    return [
      category.handle,
      ...(byParent.get(category.id) ?? []).flatMap((child) => handlesUnder(child, seen)),
    ].filter(Boolean)
  }

  const collator = new Intl.Collator(locale)

  return categories
    .filter((category) => !category.parent_category_id && category.handle)
    .sort((a, b) => collator.compare(a.name, b.name))
    .map((category, position) => ({
      id: category.id,
      name: category.name,
      handle: category.handle,
      handles: handlesUnder(category, new Set()),
      tint: categoryTint(position),
    }))
}

/** Whether the shop has a button for the row at all: a top-level category with a handle. */
export function hasRailItems(categories: HttpTypes.StoreProductCategory[]): boolean {
  return categories.some((category) => !category.parent_category_id && category.handle)
}

/**
 * Whether the row belongs on this page (the path without its locale): the home page only
 * (Ivan, 09.10.2026, t-2026-10-09-75: «вот эту навигацию оставляем только на главной
 * странице»). The catalog, a category and a product page used to have it too; there the bar
 * now carries the magnifier the row's first button was (`HeaderSearch`).
 */
export function railShownOn(path: string): boolean {
  return path === "/"
}

/** The id of the button the page is inside: on `/categories/<handle…>` the one whose subtree holds the last segment. */
export function activeItemId(path: string, items: RailItem[]): string | null {
  if (!path.startsWith("/categories/")) return null
  const segments = path
    .slice("/categories/".length)
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    })
  const handle = segments[segments.length - 1]
  if (!handle) return null
  return items.find((item) => item.handles.includes(handle))?.id ?? null
}
