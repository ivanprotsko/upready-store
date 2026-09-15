/**
 * The owner's own meta title/description for one product or category
 * (t11-seo-redirects, step 1). Medusa has no such fields on either entity, so
 * the panel writes them into `metadata.seo`, keyed by locale:
 * `{ seo: { ru: { title, description }, en: { ... } } }`. A blank string is
 * treated as unset, the same way the panel's own length hint has to, so a
 * field the owner cleared falls back rather than rendering an empty
 * `<title>`.
 *
 * The panel edits ONE locale per entity — the tenant's own `default_locale`
 * (`apps/tenant-panel/src/lib/seo-metadata.ts`) — so the entry a visitor's
 * OWN locale finds is usually empty (round 2 finding: a `default_locale=ru`
 * shop's title never reached a `/ru/...` page because both sides read the
 * literal `"en"`). `defaultLocale` is that same shop-wide fallback: a request
 * in a locale the owner never edited still gets the one title/description
 * that exists, rather than none.
 */
export type SeoMetadataEntity = { metadata?: Record<string, unknown> | null } | null | undefined

export type SeoOverride = { title?: string; description?: string }

export function seoOverride(
  entity: SeoMetadataEntity,
  locale: string,
  defaultLocale = "en"
): SeoOverride {
  const seo = entity?.metadata?.seo as Record<string, SeoOverride> | undefined
  const entry = seo?.[locale] ?? seo?.[defaultLocale]

  return {
    title: entry?.title?.trim() || undefined,
    description: entry?.description?.trim() || undefined,
  }
}
