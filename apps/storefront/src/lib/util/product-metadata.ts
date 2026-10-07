/**
 * A product's `metadata` reaches the browser with the keys this storefront reads and with
 * no other (t-2026-10-08-13).
 *
 * The owner's tools keep their working notes on the product: the price list with a price
 * in dollars and the exchange rate (`pricelist`, `pricelistPositions`), marketplace links
 * and ids (`wb`, `wb_nm_id`, `ozon_group_key`), review marks (`needs_review`,
 * `title_before_wb`). The storefront asks for `+metadata` because the course page, the SEO
 * overrides and the product markup live there, and React serialises every field of the
 * object it was handed into the page. Measured on the live shop on 08.10.2026, the whole
 * `metadata` stood in the code of 58 saved pages of 61. A visitor does not see it, «View
 * source» and a crawler do. Ivan, 08.10.2026: «проверили содержание страниц на запрещенную
 * информацию, или на наличие цен в долларах».
 *
 * This is an allow-list, so a key somebody writes on a product tomorrow stays on the
 * server until a line here says who reads it. `util/migration-metadata.ts` next to it is a
 * deny-list for every entity, and both cuts run in `lib/config.ts`, where every Store API
 * answer passes.
 *
 * The cut is not in the database and not in the backend: the panel and the owner's tools
 * read these keys there.
 */
export const PRODUCT_METADATA_KEYS = [
  // A course or another digital product: `lib/data/olavka-home.ts`,
  // `modules/products/components/product-actions`, `lib/util/shipment-groups.ts` (a cart
  // line without delivery), `lib/cart-store/draft.ts`.
  "digital",
  // The course page's sections: `lib/util/course-page.ts` (`readCoursePage`),
  // `lib/data/olavka-home.ts`.
  "course_page",
  // The course cover: `lib/util/course-page.ts` (`readCourseCover`), `lib/data/olavka-home.ts`.
  "cover",
  // Per-language title and description overrides: `lib/util/tenant-seo.ts` (`seoOverride`).
  "seo",
  // The product's `ld+json`: `lib/util/json-ld.ts`.
  "condition",
  "brand",
  "mpn",
  // The first image's ratio, "3/4" or "1:1": `modules/products/components/image-gallery/items.ts`
  // (`parseAspect`).
  "aspect_ratio",
] as const

const ALLOWED: ReadonlySet<string> = new Set(PRODUCT_METADATA_KEYS)

/** Medusa gives every product an id that starts with this. */
const PRODUCT_ID_PREFIX = "prod_"

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** A copy of one product with `metadata` cut to the allow-list, or the product as it was. */
export function allowProductMetadata<T>(product: T): T {
  if (!isPlainObject(product)) {
    return product
  }

  const metadata = product.metadata

  if (!isPlainObject(metadata)) {
    return product
  }

  const keys = Object.keys(metadata)

  if (keys.every((key) => ALLOWED.has(key))) {
    return product
  }

  const clean: Record<string, unknown> = {}
  for (const key of keys) {
    if (ALLOWED.has(key)) {
      clean[key] = metadata[key]
    }
  }

  return { ...product, metadata: clean } as T
}

/**
 * The same cut over a whole Store API answer. A product is an object with a product id, and
 * also whatever stands under a key named `product` or `products`: a category's `products`,
 * a cart line's `product`, the list a search answers with. A `fields` list that leaves the
 * id out is covered by the second half.
 *
 * Nothing but a product loses a key here. A category keeps its image, a cart and its lines
 * keep their own `metadata`, an option value keeps its colour. An answer with nothing to
 * cut is returned as it came, by identity.
 */
export function redactProductMetadata<T>(value: T, asProduct = false, depth = 0): T {
  // The same guard `redactMigrationMetadata` has: a bound against a cycle, not a limit.
  if (depth > 12) {
    return value
  }

  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const cleaned = redactProductMetadata(item, asProduct, depth + 1)
      if (cleaned !== item) changed = true
      return cleaned
    })
    return (changed ? next : value) as T
  }

  if (!isPlainObject(value)) {
    return value
  }

  const isProduct =
    asProduct || (typeof value.id === "string" && value.id.startsWith(PRODUCT_ID_PREFIX))
  const allowed = isProduct ? allowProductMetadata(value) : value
  let changed = allowed !== value
  const out: Record<string, unknown> = { ...allowed }

  for (const [key, child] of Object.entries(out)) {
    if (key === "metadata") continue
    const cleaned = redactProductMetadata(child, key === "product" || key === "products", depth + 1)
    if (cleaned !== child) {
      out[key] = cleaned
      changed = true
    }
  }

  return (changed ? out : value) as T
}
