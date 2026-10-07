/**
 * A category's linked products never reach the page whole (t-2026-10-08-13, part A5).
 *
 * `lib/data/categories.ts` asks for `*products`, and Medusa answers with EVERY product linked
 * to the category, drafts and products outside the storefront's sales channel included, each
 * with its `title`, `description`, `subtitle` and `metadata`. The category tree goes to the
 * header, the footer and the menus, from there into client components, and React serialises
 * every field of the object it was handed into the RSC payload inside the HTML. Measured on
 * cherkashino.ru, 2026-10-08: the code of the offer page and of the empty cart carried 32
 * products, three of them `"status":"draft"`, with their full card texts — a page that shows
 * no product at all. A card the owner hides by making it a draft stayed in the code of every
 * page of the shop.
 *
 * The storefront never reads a field of these products. Its three readers only COUNT them
 * (`.length`): the menu's fallback for a failed `/store/products` read in
 * `lib/data/categories.ts`, the hero gallery's "N products" line and the category page's
 * skeleton count. So the cut keeps one `{ id }` per product and nothing else.
 *
 * Two rules, one place:
 *   1. a product whose `status` is present and is not `published` is removed, so no count
 *      below ever sees a draft;
 *   2. every product that stays is reduced to its `id`.
 *
 * A product that carries no `status` field at all is kept: the caller asked for a narrower
 * `fields` list, the cut cannot tell a draft from a published product there, and dropping it
 * would empty the menu on the very path that exists so the menu is never empty (the fallback
 * in `categoryHasProducts`). Whatever it is, only its `id` goes on.
 *
 * The type stays `HttpTypes.StoreProductCategory` although `products` is narrower at run time:
 * the tree is typed that way in every nav, footer and sidebar variant. Read a product's fields
 * through `/store/products` (`lib/data/products.ts`), which is published-only and scoped to
 * the sales channel — never through a category.
 */

/** What is left of a product inside a category: enough to count it, nothing to read. */
export type CategoryProductRef = { id: string }

const PUBLISHED = "published"

// A category tree is a handful of levels deep. The bound guards against a cycle in a
// hand-built object, the same way `redactMigrationMetadata` bounds its own walk. Past it the
// nested relations are dropped, not passed on whole.
const MAX_DEPTH = 12

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** The products of one category after both rules: drafts out, `{ id }` only. */
export function categoryProductRefs(products: unknown[]): CategoryProductRef[] {
  return products
    .filter(isPlainObject)
    .filter((product) => !("status" in product) || product.status === PUBLISHED)
    .map((product) => ({ id: product.id }) as CategoryProductRef)
}

/**
 * The same category with `products` cut down — on the category itself, on every
 * `category_children` entry at any depth, and up the `parent_category` chain. A category
 * that never carried `products` (a call with a narrower `fields` list) gets none added.
 */
export function withCategoryProductRefs<T>(category: T, depth = 0): T {
  if (!isPlainObject(category)) {
    return category
  }

  const cut: Record<string, unknown> = { ...category }

  if (depth > MAX_DEPTH) {
    delete cut.products
    delete cut.category_children
    delete cut.parent_category
    return cut as T
  }

  if (Array.isArray(cut.products)) {
    cut.products = categoryProductRefs(cut.products)
  }

  if (Array.isArray(cut.category_children)) {
    cut.category_children = cut.category_children.map((child) =>
      withCategoryProductRefs(child, depth + 1)
    )
  }

  if (isPlainObject(cut.parent_category)) {
    cut.parent_category = withCategoryProductRefs(cut.parent_category, depth + 1)
  }

  return cut as T
}
