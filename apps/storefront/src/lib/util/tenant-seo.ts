/**
 * The owner's own meta title/description for one product or category
 * (t11-seo-redirects, step 1). Medusa has no such fields on either entity, so
 * the panel writes them into `metadata.seo`, keyed by locale:
 * `{ seo: { ru: { title, description }, en: { ... } } }`. A blank string is
 * treated as unset, the same way the panel's own length hint has to, so a
 * field the owner cleared falls back rather than rendering an empty
 * `<title>`.
 */
export type SeoMetadataEntity = { metadata?: Record<string, unknown> | null } | null | undefined

export type SeoOverride = { title?: string; description?: string }

export function seoOverride(entity: SeoMetadataEntity, locale: string): SeoOverride {
  const seo = entity?.metadata?.seo as Record<string, SeoOverride> | undefined
  const entry = seo?.[locale]

  return {
    title: entry?.title?.trim() || undefined,
    description: entry?.description?.trim() || undefined,
  }
}
