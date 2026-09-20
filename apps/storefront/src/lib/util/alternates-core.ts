import { locales, defaultLocale } from "@i18n/config"

/** The pure half: `base` is an origin with no trailing slash. */
export function buildAlternatesFor(
  base: string,
  locale: string,
  path: string,
  languages: readonly string[] = locales
) {
  const suffix = path === "/" ? "" : path

  // `x-default` names the page a crawler should serve when it knows no better.
  // It has to be a page the shop actually publishes, so a shop that does not
  // offer the build's default locale gets its own first language instead of a
  // link into a language it never chose.
  const fallback = languages.includes(defaultLocale) ? defaultLocale : languages[0] ?? defaultLocale

  const alternates: Record<string, string> = {
    "x-default": `${base}/${fallback}${suffix}`,
  }

  for (const l of languages) {
    alternates[l] = `${base}/${l}${suffix}`
  }

  return {
    canonical: `${base}/${locale}${suffix}`,
    languages: alternates,
  }
}
