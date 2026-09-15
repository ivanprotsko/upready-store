/**
 * A category's own picture: the one the shop owner uploads in the tenant panel,
 * `routes/categories/category-edit/components/edit-category-form/edit-category-form.tsx`.
 *
 * A category has no image column in core Medusa, so it lives on `metadata.image_url`
 * with `metadata.image_alt` beside it (t-2026-09-12-mt-storefront-by-host, W3). The
 * panel writes those two keys and nothing else reads them, which is why this file
 * exists: f16-category-image-not-shown found the owner's upload arriving in the
 * storefront's own data (`GET /store/tenant/product-categories?fields=+metadata`
 * returned it) and drawn on no page at all, because the home block was the single
 * reader and it kept the picture to itself unless three categories had one.
 *
 * One reader, four surfaces: the home tiles, the catalog strip, a category page's
 * own header and its children's tiles.
 */
export type CategoryImage = {
  /** The address the owner saved, or null when the field is empty or not a string. */
  url: string | null
  /** The owner's description, `""` when absent — decorative art takes an empty alt. */
  alt: string
}

type WithMetadata = { metadata?: Record<string, unknown> | null }

export function categoryImage(category: WithMetadata): CategoryImage {
  const meta = (category.metadata ?? {}) as Record<string, unknown>
  const url =
    typeof meta.image_url === "string" && meta.image_url.trim() ? meta.image_url : null
  const alt = typeof meta.image_alt === "string" ? meta.image_alt : ""
  return { url, alt }
}

type Tileable = WithMetadata & {
  rank?: number | null
  category_children?: { id?: string }[] | null
}

/**
 * The categories a tile block should draw, for a shop whose owner gave at least one
 * category a picture. ONE picture is enough: the old home block required three and
 * fell back to the build profile's foreign list below that, so an owner who uploaded
 * a single photograph saw nothing change and no explanation anywhere (f16).
 *
 * Leaves win when any leaf carries a picture, which keeps the starter catalogs
 * exactly as they were: `migration-scripts/data/abstract-datasets.ts` puts an
 * `image_url` on roots AND leaves, and those shops have always shown the leaf grid.
 * A shop whose only pictured category is a root (or a flat shop like Оксана's, where
 * every category is both) then still gets its tiles instead of nothing.
 */
export function categoriesWithImages<T extends Tileable>(
  categories: readonly T[],
  limit: number
): T[] {
  const withImage = categories.filter((category) => categoryImage(category).url)
  const leaves = withImage.filter(
    (category) => !(category.category_children ?? []).length
  )
  const picked = leaves.length ? leaves : withImage

  return [...picked].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)).slice(0, limit)
}
