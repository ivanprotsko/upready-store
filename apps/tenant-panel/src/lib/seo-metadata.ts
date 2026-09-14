/**
 * The owner's own meta title/description for a product or category
 * (t11-seo-redirects step 1). Medusa has no such fields on either entity, so
 * they live in `metadata.seo`, keyed by locale — the storefront reads the
 * same shape (`apps/storefront/src/lib/util/tenant-seo.ts`).
 *
 * One locale for now, `"en"`, the same scope `tenant_page`'s own SEO fields
 * ship with today (`edit-page-form.tsx`: "the panel edits one language
 * today"). A locale switcher for this screen is follow-up work, not a
 * narrower feature — the value already round-trips per locale on read.
 */
export const SEO_METADATA_LOCALE = "en"

export type SeoMetadataEntry = { title?: string; description?: string }

/** Reads this entity's SEO override for `SEO_METADATA_LOCALE`, or blanks. */
export function readSeoOverride(
  metadata: Record<string, unknown> | null | undefined
): { seo_title: string; seo_description: string } {
  const seo = metadata?.seo as Record<string, SeoMetadataEntry> | undefined
  const entry = seo?.[SEO_METADATA_LOCALE]

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
  seoDescription: string
): Record<string, unknown> {
  const base = { ...(metadata ?? {}) }
  const seo = { ...((base.seo as Record<string, SeoMetadataEntry> | undefined) ?? {}) }

  const entry: SeoMetadataEntry = {}
  if (seoTitle.trim()) entry.title = seoTitle.trim()
  if (seoDescription.trim()) entry.description = seoDescription.trim()

  if (Object.keys(entry).length > 0) {
    seo[SEO_METADATA_LOCALE] = entry
  } else {
    delete seo[SEO_METADATA_LOCALE]
  }

  if (Object.keys(seo).length > 0) {
    base.seo = seo
  } else {
    delete base.seo
  }

  return base
}
