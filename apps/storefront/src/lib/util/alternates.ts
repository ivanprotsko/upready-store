import { locales, defaultLocale } from "@i18n/config"
import { getRequestBaseURL } from "@lib/data/cookies"

/** The pure half: `base` is an origin with no trailing slash. */
export function buildAlternatesFor(base: string, locale: string, path: string) {
  const suffix = path === "/" ? "" : path

  const languages: Record<string, string> = {
    "x-default": `${base}/${defaultLocale}${suffix}`,
  }

  for (const l of locales) {
    languages[l] = `${base}/${l}${suffix}`
  }

  return {
    canonical: `${base}/${locale}${suffix}`,
    languages,
  }
}

/**
 * `canonical` plus one `hreflang` per locale, on the origin THIS request arrived on.
 * One process serves every shop by Host, so the base is read per request
 * (`getRequestBaseURL`) rather than once per module: the constant that stood here put
 * `https://stores.shipshift.dev` into the <head> of every tenant storefront
 * (measured 2026-09-12 on five hosts). See `lib/tenant/origin.ts`.
 */
export async function buildAlternates(locale: string, path: string) {
  return buildAlternatesFor(await getRequestBaseURL(), locale, path)
}
