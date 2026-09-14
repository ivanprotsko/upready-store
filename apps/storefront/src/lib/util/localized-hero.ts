import type { TenantHeroContent } from "@lib/data/tenant-home"

/**
 * The hero copy in the visitor's language. A shop's home document carries one base
 * language plus optional per-locale overrides (`content.hero.i18n`), so a Russian
 * visitor of a shop whose owner wrote English copy is not shown an English subtitle
 * over a Russian catalog (measured on acme/globex/initech `/ru`, 2026-09-12). A locale
 * with no override, and a document written before the field existed, fall through to
 * the base fields; a regional locale (`pt-BR`) falls back to its language (`pt`).
 */
export function localizedHero(
  hero: TenantHeroContent | undefined | null,
  locale: string
): TenantHeroContent | undefined {
  if (!hero) return undefined
  const copy = hero.i18n?.[locale] ?? hero.i18n?.[locale.split("-")[0]]
  return copy ? { ...hero, ...copy } : hero
}
