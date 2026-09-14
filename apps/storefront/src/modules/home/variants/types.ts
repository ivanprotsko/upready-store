import type { HomeProductsSource } from "@lib/data/home"

/**
 * The props the home-slot variants take from the tenant's home-page document
 * (`upready.tenant-home/v1`, tenant panel wave 2 piece 8). Every field is optional and
 * every variant keeps its own behaviour when the field is absent, which is the state of
 * the five old stands: they have no tenant document, `(main)/page.tsx` passes nothing,
 * and the variants render exactly what they rendered before this piece.
 *
 * A plain module, imported by both the variants and the registry that lists them, so the
 * registry can type its entries without the variants importing the registry back.
 */
export type HomeHeroProps = {
  /** Replaces the headline the variant would show (the profile's, the product's, the
   *  collection's — whichever that variant uses). */
  title?: string | null
  subtitle?: string | null
  ctaLabel?: string | null
  ctaHref?: string | null
  /** Only the variants that show one photograph read this; the shelf and the galleries
   *  compose several images of their own and ignore it. */
  imageUrl?: string | null
  /**
   * Whether a field left empty may fall back to the build profile's own hero. True
   * (the default) is the single-store stand; a shop served from its own home document
   * passes false, because the profile baked into the image is another shop's: its
   * photograph reached a wizard-created shop as a broken image and its subheadline
   * would have spoken for the tenant (measured on the local build for nochlavka,
   * 2026-09-12 — the same class as the tiles and promo strip of 91d4977).
   */
  profileFallback?: boolean
}

/** `content.products` of the document: which products the listing block shows. */
export type HomeListingProps = {
  products?: HomeProductsSource
}
