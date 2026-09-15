/**
 * The owner's own meta title/description for a product or category
 * (t11-seo-redirects step 1). Medusa has no such fields on either entity, so
 * they live in `metadata.seo`, keyed by locale — the storefront reads the
 * same shape (`apps/storefront/src/lib/util/tenant-seo.ts`).
 *
 * The panel still edits ONE locale per entity — a full per-field switcher is
 * follow-up work, the value already round-trips per locale on read — but
 * which one is the shop's own `default_locale` (`tenant_locale_settings`,
 * t06-locale-currency), not a literal `"en"`: a `default_locale=ru` shop's
 * title has to land on its `/ru/...` pages, and `tenant_page`'s own SEO
 * fields already work this way (one row per locale, edited in whichever
 * locale the owner has open). `DEFAULT_SEO_METADATA_LOCALE` is only the
 * fallback for a tenant that never saved locale settings.
 */
export const DEFAULT_SEO_METADATA_LOCALE = "en"

export type SeoMetadataEntry = { title?: string; description?: string }

/** Reads this entity's SEO override for `locale`, or blanks. */
export function readSeoOverride(
  metadata: Record<string, unknown> | null | undefined,
  locale: string = DEFAULT_SEO_METADATA_LOCALE
): { seo_title: string; seo_description: string } {
  const seo = metadata?.seo as Record<string, SeoMetadataEntry> | undefined
  const entry = seo?.[locale]

  return {
    seo_title: entry?.title ?? "",
    seo_description: entry?.description ?? "",
  }
}

/**
 * Merges a new SEO title/description into an entity's existing `metadata`,
 * without touching any other key or any other locale's entry. An empty string
 * clears that one field (deletes it from the stored object) rather than
 * writing an empty value the storefront would have to re-treat as unset.
 */
export function mergeSeoMetadata(
  metadata: Record<string, unknown> | null | undefined,
  seoTitle: string,
  seoDescription: string,
  locale: string = DEFAULT_SEO_METADATA_LOCALE
): Record<string, unknown> {
  const base = { ...(metadata ?? {}) }
  const seo = { ...((base.seo as Record<string, SeoMetadataEntry> | undefined) ?? {}) }

  const entry: SeoMetadataEntry = {}
  if (seoTitle.trim()) entry.title = seoTitle.trim()
  if (seoDescription.trim()) entry.description = seoDescription.trim()

  if (Object.keys(entry).length > 0) {
    seo[locale] = entry
  } else {
    delete seo[locale]
  }

  if (Object.keys(seo).length > 0) {
    base.seo = seo
  } else {
    delete base.seo
  }

  return base
}
