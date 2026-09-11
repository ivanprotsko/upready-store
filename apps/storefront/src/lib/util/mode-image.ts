/**
 * The one place that knows the mode-image-pair convention
 * (`specs/store-profiles/MODE-IMAGE-PAIRS.md`, `upready.mode-image-pair/v1`).
 *
 * The rule: the base field keeps its name and means "show this in any mode"; the dark
 * version sits next to it under the base name plus `_dark`. There is no `_light` field on
 * purpose — the base IS the light version, and a second field for the same frame would be
 * a second way to say one thing.
 *
 * Three surfaces, one rule:
 *
 *   hero      `content.hero.image_url`          -> `content.hero.image_url_dark`
 *   category  `metadata.image_url`              -> `metadata.image_url_dark`
 *   product   `thumbnail` (else `images[0]`)    -> `metadata.image_url_dark`
 *
 * Every consumer asks these functions rather than reading the keys itself, so a fourth
 * surface costs one call and not a fourth spelling of the convention.
 */

/** An empty string, whitespace and a non-string are all "no image", never a broken src. */
function url(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

type MetadataBag = Record<string, unknown> | null | undefined

/** `metadata.image_url` of a category or anything else carrying the same two keys. */
export function metadataImage(metadata: MetadataBag): string | null {
  return url((metadata ?? {}).image_url)
}

/** `metadata.image_url_dark` — the dark version, or null when the pair was never filled. */
export function metadataImageDark(metadata: MetadataBag): string | null {
  return url((metadata ?? {}).image_url_dark)
}

/** `metadata.image_alt` — one description per pair, the same frame under two lightings. */
export function metadataImageAlt(metadata: MetadataBag): string {
  return url((metadata ?? {}).image_alt) ?? ""
}

type ProductLike = {
  thumbnail?: string | null
  images?: { url?: string | null }[] | null
  metadata?: MetadataBag
}

/**
 * The product's main image — what the card shows and what the gallery opens on. The pair
 * is defined against THIS frame and not against every gallery slide: Ivan's order was two
 * images per product, one pair, not a doubled gallery (`MODE-IMAGE-PAIRS.md` §5).
 */
export function productMainImage(product: ProductLike): string | null {
  return url(product.thumbnail) ?? url(product.images?.[0]?.url)
}

/** The dark version of the product's main image. */
export function productImageDark(product: ProductLike): string | null {
  return metadataImageDark(product.metadata)
}

/**
 * Whether a real pair exists. A dark version equal to the base is not a pair: it would
 * put a second identical layer in the DOM and cost a second request on every mode flip.
 */
export function hasPair(base: string | null | undefined, dark: string | null | undefined): boolean {
  const b = url(base)
  const d = url(dark)
  return Boolean(d) && d !== b
}

/**
 * Which gallery frame the pair belongs to: the one whose url is the product's main image,
 * and index 0 when the product has no thumbnail at all. Shared by the card and the gallery
 * so the two never disagree about which frame is "the product's image".
 */
export function isMainImage(
  mainImage: string | null | undefined,
  imageUrl: string | null | undefined,
  index: number
): boolean {
  const main = url(mainImage)
  return main ? url(imageUrl) === main : index === 0
}
