import { locales, defaultLocale } from "@i18n/config"

/** One sister site of the same client (t-cherk-31): its own origin and the one locale it stands for. */
export type SisterSite = {
  origin: string
  locale: string
}

/** The pure half: `base` is an origin with no trailing slash. */
export function buildAlternatesFor(
  base: string,
  locale: string,
  path: string,
  languages: readonly string[] = locales,
  sisters: readonly SisterSite[] = []
) {
  const suffix = path === "/" ? "" : path

  const alternates: Record<string, string> = {}

  for (const l of languages) {
    alternates[l] = `${base}/${l}${suffix}`
  }

  // A sister only fills a language THIS shop does not already publish itself:
  // its own page always wins for its own locale, canonical stays this shop's
  // own domain, and a shop with no sisters leaves this loop a no-op.
  for (const sister of sisters) {
    if (alternates[sister.locale]) {
      continue
    }

    alternates[sister.locale] = `${sister.origin}/${sister.locale}${suffix}`
  }

  // `x-default` names the page a crawler should serve when it knows no better.
  // It has to be a page the shop (or one of its sisters) actually publishes, so
  // a shop that does not offer the build's default locale, but has a sister
  // that does, points `x-default` at the sister rather than its own first
  // language — the same rule `plan.md` spells out for Cherkashino: `ru` stays
  // on .ru, `en`/`x-default` point at .com.
  const fallbackLocale = alternates[defaultLocale] ? defaultLocale : languages[0] ?? defaultLocale

  alternates["x-default"] = alternates[fallbackLocale] ?? `${base}/${fallbackLocale}${suffix}`

  return {
    canonical: `${base}/${locale}${suffix}`,
    languages: alternates,
  }
}
