/**
 * Which languages a SHOP is published in, as opposed to which ones this build
 * ships (b08-seo-storefront).
 *
 * One storefront process serves every shop, and the build carries 36 locales
 * (`@i18n/config`). Emitting all 36 for a shop that offers two puts 34 dead
 * languages into its sitemap and its `hreflang` block: the Cherkashina shop's
 * sitemap listed 1481 addresses across 36 locales on the b08 stand, where the
 * owner's own settings name `ru` and `en`. Every one of those extra addresses
 * answers 200 with the same Russian catalogue under an `ar`/`zh`/`th` prefix,
 * which is a crawl budget spent on duplicates of the two pages that matter.
 *
 * The shop's list is `tenant_locale_settings.enabled_locales` (t06), reaching
 * the storefront as `x-tenant-locales` and read by
 * `getEnabledLocales()`. `null` there means "this shop saved nothing", not
 * "this shop is English": a single-store deployment resolves no tenant at all,
 * and the live Cherkashina tenant had no settings row on 2026-09-15. That case
 * keeps exactly today's behaviour, every shipped locale — narrowing a shop
 * nobody configured would drop languages it may well be serving.
 */
export function shopLocales<T extends string>(
  shipped: readonly T[],
  enabled: string[] | null,
  fallbackLocale: T,
): T[] {
  if (!enabled || enabled.length === 0) {
    return [...shipped]
  }

  const narrowed = shipped.filter((locale) => enabled.includes(locale))

  if (narrowed.length > 0) {
    return narrowed
  }

  // The shop named languages this build does not ship. Listing all 36 would be
  // the widest possible answer to "we do not have what you asked for", and
  // listing none would leave the shop out of the index altogether, so the one
  // locale every deployment can render carries it.
  return shipped.includes(fallbackLocale) ? [fallbackLocale] : [...shipped]
}

/**
 * Where an address under a language the shop does not publish goes (46df
 * A-12): the same path under the shop's own default language, or `null` when
 * the language is one of the shop's, or the shop saved no list at all (the
 * case `shopLocales` above keeps wide open, for the reason it gives).
 *
 * Without this, `/en/pages/offer` on a Russian-only shop answered 200 with the
 * Russian page under `lang="en"`: a duplicate for search engines and a mixed
 * page for the buyer. The sitemap and the switcher already leave such a
 * language out; this closes the direct address.
 */
export function shopLocaleRedirect(
  pathname: string,
  shop: { defaultLocale: string; enabledLocales: string[] } | null | undefined,
  shipped: readonly string[],
): string | null {
  if (!shop || shop.enabledLocales.length === 0) {
    return null
  }

  const [, urlLocale, ...rest] = pathname.split("/")

  if (!urlLocale || shop.enabledLocales.includes(urlLocale)) {
    return null
  }

  const published = shop.enabledLocales.filter((locale) => shipped.includes(locale))
  const target = published.includes(shop.defaultLocale) ? shop.defaultLocale : published[0]

  if (!target) {
    return null
  }

  return `/${[target, ...rest].join("/")}`
}
