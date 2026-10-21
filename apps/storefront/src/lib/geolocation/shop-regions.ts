/**
 * The regions ONE shop sells in (t-2026-10-04-19, N9 of pass 3 over the live
 * cherkashino.ru: «Смена региона» listed every country the backend has, and
 * «Германия → Применить» priced the course at 199,00 € and left the pastes
 * with no price at all).
 *
 * Regions are store-wide in Medusa — one per country on every deployment, the
 * seed's 241 — so the backend's own list says nothing about a shop. What does
 * is the chain the middleware already prices a page through when the visitor
 * has picked nothing (`resolveCountry`, `@lib/geolocation`): the tenant's own
 * `default_country` for its default locale (t06-locale-currency), else the
 * deployment's `LOCALE_COUNTRY_MAP` entry for the locale, else the pinned
 * `DEFAULT_REGION`. The regions those land on, over every locale the shop
 * offers, are the shop's regions: the ones its owner has said it prices in.
 * Every other region is one its prices were never set up for.
 *
 * Null means "no narrowing", today's behaviour: a locale whose country is left
 * to detection (an unpinned deployment) can land on any region, so none can be
 * ruled out. A region counts whole — every country it carries, not only the
 * one a locale named — so a shop's «International» region keeps all of its
 * countries.
 */
/**
 * Whether this deployment narrows a shop's regions at all (`SHOP_REGIONS`).
 * The RU host keeps the narrowing N9 was made for (cherkashino.ru, one
 * currency). The INTL host sells abroad and sets `SHOP_REGIONS=all`: every
 * country the backend has stays in «Смена региона» (Ivan 21.10.2026 on
 * cherkashino.com: «СРОНО ВЕРНУТЬ ВСЕ СТРАНЫ»).
 */
export const shopRegionsNarrowed = (
  raw: string | undefined = process.env.SHOP_REGIONS
): boolean => raw?.trim().toLowerCase() !== "all"

export const shopRegionIds = ({
  locales,
  countryFor,
  fallbackCountry,
  regionMap,
}: {
  /** The locales the shop's switcher offers. */
  locales: readonly string[]
  /** The country a locale prices in, or null when nothing names one. */
  countryFor: (locale: string) => string | null
  /** The pinned `DEFAULT_REGION`, or null when the deployment detects. */
  fallbackCountry: string | null
  regionMap: Map<string, { id: string }>
}): Set<string> | null => {
  if (!locales.length || !regionMap.size) {
    return null
  }

  const fallback =
    fallbackCountry && regionMap.has(fallbackCountry) ? fallbackCountry : null
  const ids = new Set<string>()

  for (const locale of locales) {
    const mapped = countryFor(locale)
    const country = mapped && regionMap.has(mapped) ? mapped : fallback

    if (!country) {
      return null
    }

    ids.add(regionMap.get(country)?.id ?? "")
  }

  ids.delete("")

  return ids.size ? ids : null
}

/** `regionMap` cut down to the countries of `ids`, or the whole map when `ids` is null. */
export const narrowRegionMap = <R extends { id: string }>(
  regionMap: Map<string, R>,
  ids: Set<string> | null
): Map<string, R> => {
  if (!ids) {
    return regionMap
  }

  return new Map(
    Array.from(regionMap).filter(([, region]) => ids.has(region.id))
  )
}

/** `regions` cut down to `ids`, or all of them when `ids` is null. */
export const narrowRegions = <R extends { id: string }>(
  regions: R[],
  ids: readonly string[] | null
): R[] => (ids ? regions.filter((region) => ids.includes(region.id)) : regions)
