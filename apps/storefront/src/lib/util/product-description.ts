import { markdownText } from "./markdown-text"
import { metaDescription } from "./meta-description"

/**
 * The words a product's description falls back to (t-2026-10-08-13, part A8). Both come from
 * keys every catalog already has, so no new word enters a dictionary.
 */
export type ProductDescriptionCopy = {
  /** `TenantPage.metaDescription` — «{title} в {siteName}.», the line a content page falls back to. */
  titled: (values: { title: string; siteName: string }) => string
  /** `Metadata.home.description` — the shop's neutral line, the one its home page falls back to. */
  neutral: string
  siteName: string
}

/**
 * The description of a product whose owner wrote no text for it (t-2026-10-08-13, part A8).
 *
 * Measured on a live shop, 2026-10-08: 5 product pages of 30 had no `<meta name="description">`
 * and no `og:description` at all — the cards without a product text. The line is the product's
 * title in the shop («{title} в {siteName}.») followed by the shop's neutral line: what the
 * page is and where, and no promise about the product that its owner did not make.
 *
 * It goes through `markdownText` like a page's description does (part A5), so a title typed
 * with markup marks reaches a `<meta>` tag as words. A product without a title gets the
 * neutral line alone.
 */
export function productFallbackDescription(
  title: string | null | undefined,
  { titled, neutral, siteName }: ProductDescriptionCopy
): string | undefined {
  const name = title?.trim()
  const line = name ? `${titled({ title: name, siteName })} ${neutral}` : neutral

  return metaDescription(markdownText(line))
}

/**
 * The description of a product page for search engines and social cards: the SEO override,
 * the product's own text, its subtitle — exactly as before part A8 — and only when all three
 * are empty, the fallback line.
 */
export function productMetaDescription(
  product: {
    override?: string | null
    description?: string | null
    subtitle?: string | null
    title?: string | null
  },
  copy: ProductDescriptionCopy
): string | undefined {
  return (
    metaDescription(product.override, product.description, product.subtitle) ??
    productFallbackDescription(product.title, copy)
  )
}
