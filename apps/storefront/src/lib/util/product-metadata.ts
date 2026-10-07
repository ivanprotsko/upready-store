/**
 * A product's `metadata`, the `metadata` of its variants and of its pictures reach the browser
 * with the keys this storefront reads and with no other (t-2026-10-08-13).
 *
 * The owner's tools keep their working notes on the product and on each of its variants:
 * the price list with a price in dollars and the exchange rate (`pricelist`,
 * `pricelistPositions`), marketplace links and ids (`wb`, `wb_url`, `wb_nm_id`,
 * `ozon_group_key`), review marks (`needs_review`, `title_before_wb`). The storefront asks
 * for `+metadata` because the course page, the SEO overrides and the product markup live
 * there, a variant comes whole (`*items.variant`, the product's `variants`), and React
 * serialises every field of the object it was handed into the page. Measured on the live
 * shop on 08.10.2026, the whole `metadata` stood in the code of 58 saved pages of 61. A
 * visitor does not see it, «View source» and a crawler do. Ivan, 08.10.2026: «проверили
 * содержание страниц на запрещенную информацию, или на наличие цен в долларах».
 *
 * These are allow-lists, so a key somebody writes on a product, a variant or a picture
 * tomorrow stays on the server until a line here says who reads it. `util/migration-metadata.ts` next to it
 * is a deny-list for every entity, and both cuts run in `lib/config.ts`, where every Store
 * API answer passes.
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

/**
 * A variant's `metadata` has no reader in this storefront, so the list is empty and every
 * key stays on the server. The acceptance check of 08.10.2026 found the price list there
 * after the product's own `metadata` was cut: a product page carried it under
 * `variants[].metadata.pricelist`, with `variant_images` beside it. A variant's pictures
 * come from its `images` (`*variants.images`), not from `metadata`.
 */
export const VARIANT_METADATA_KEYS: readonly string[] = []

/**
 * A picture's `metadata` has no reader in this storefront either: a picture is drawn from its
 * `url` and ordered by its `rank`. The second pass of the acceptance check of 08.10.2026 found
 * the importer's notes there: 12 product pages of 30 carried `wb_photo_key` and
 * `wb_source_url` on every picture record (`images[].metadata`), the second one with the
 * address of the marketplace's picture host.
 */
export const IMAGE_METADATA_KEYS: readonly string[] = []

/** Whose `metadata` an object carries, as far as this cut is concerned. */
type Carrier = "product" | "variant" | "image"

const ALLOWED_BY_CARRIER: Readonly<Record<Carrier, ReadonlySet<string>>> = {
  product: new Set(PRODUCT_METADATA_KEYS),
  variant: new Set(VARIANT_METADATA_KEYS),
  image: new Set(IMAGE_METADATA_KEYS),
}

/** Medusa gives every product, every variant and every picture an id that starts with this. */
const ID_PREFIX: ReadonlyArray<[string, Carrier]> = [
  ["prod_", "product"],
  ["variant_", "variant"],
  ["img_", "image"],
]

/**
 * The keys a Store API answer keeps a product, a variant or a picture under. Pictures stand
 * under `images` only (a product's and a variant's); `thumbnail` is a plain address.
 */
const CARRIER_BY_KEY: ReadonlyMap<string, Carrier> = new Map([
  ["product", "product"],
  ["products", "product"],
  ["variant", "variant"],
  ["variants", "variant"],
  ["images", "image"],
])

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

function allowMetadata<T>(entity: T, allowed: ReadonlySet<string>): T {
  if (!isPlainObject(entity)) {
    return entity
  }

  const metadata = entity.metadata

  if (!isPlainObject(metadata)) {
    return entity
  }

  const keys = Object.keys(metadata)

  if (keys.every((key) => allowed.has(key))) {
    return entity
  }

  const clean: Record<string, unknown> = {}
  for (const key of keys) {
    if (allowed.has(key)) {
      clean[key] = metadata[key]
    }
  }

  return { ...entity, metadata: clean } as T
}

/** A copy of one product with `metadata` cut to the allow-list, or the product as it was. */
export function allowProductMetadata<T>(product: T): T {
  return allowMetadata(product, ALLOWED_BY_CARRIER.product)
}

/** A copy of one variant with `metadata` cut to the allow-list, or the variant as it was. */
export function allowVariantMetadata<T>(variant: T): T {
  return allowMetadata(variant, ALLOWED_BY_CARRIER.variant)
}

/** A copy of one picture with `metadata` cut to the allow-list, or the picture as it was. */
export function allowImageMetadata<T>(image: T): T {
  return allowMetadata(image, ALLOWED_BY_CARRIER.image)
}

const carrierOf = (value: Record<string, unknown>, under: Carrier | null): Carrier | null => {
  if (under) {
    return under
  }
  const id = value.id
  if (typeof id !== "string") {
    return null
  }
  return ID_PREFIX.find(([prefix]) => id.startsWith(prefix))?.[1] ?? null
}

/**
 * The same cut over a whole Store API answer. A product is an object with a product id, and
 * also whatever stands under a key named `product` or `products`: a category's `products`,
 * a cart line's `product`, the list a search answers with. A variant is an object with a
 * variant id, and whatever stands under `variant` or `variants`: a product's `variants`, the
 * `variant` of a cart line and of an order line. A picture is an object with a picture id,
 * and whatever stands under `images`: a product's and a variant's. A `fields` list that
 * leaves the id out is covered by the second half.
 *
 * Nothing but a product, a variant and a picture loses a key here. A category keeps its
 * image, a cart, an order and their lines keep their own `metadata`, an option value keeps
 * its colour. An answer with nothing to cut is returned as it came, by identity.
 */
export function redactProductMetadata<T>(value: T, under: Carrier | null = null, depth = 0): T {
  // The same guard `redactMigrationMetadata` has: a bound against a cycle, not a limit.
  if (depth > 12) {
    return value
  }

  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const cleaned = redactProductMetadata(item, under, depth + 1)
      if (cleaned !== item) changed = true
      return cleaned
    })
    return (changed ? next : value) as T
  }

  if (!isPlainObject(value)) {
    return value
  }

  const carrier = carrierOf(value, under)
  const allowed = carrier ? allowMetadata(value, ALLOWED_BY_CARRIER[carrier]) : value
  let changed = allowed !== value
  const out: Record<string, unknown> = { ...allowed }

  for (const [key, child] of Object.entries(out)) {
    if (key === "metadata") continue
    const cleaned = redactProductMetadata(child, CARRIER_BY_KEY.get(key) ?? null, depth + 1)
    if (cleaned !== child) {
      out[key] = cleaned
      changed = true
    }
  }

  return (changed ? out : value) as T
}
