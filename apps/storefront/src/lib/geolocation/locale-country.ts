/**
 * Which country a storefront locale implies — and therefore which Medusa region,
 * and therefore which currency the prices on that page are quoted in
 * (`t-2026-09-12-locale-currency`, Ivan's order 4.1: rubles on the Russian
 * version, dollars on the English one).
 *
 * The prices themselves are NOT converted here or anywhere in the markup: a
 * region carries its own price rows, measured on the live backend 2026-09-12 —
 * `flagstone-low` is `128.99 usd` in the United States region and `11170.99 rub`
 * in the Russia region. Picking the region is the whole mechanism.
 *
 * `LOCALE_COUNTRY_MAP` is deployment configuration, `"<locale>:<country>,…"`,
 * and it is EMPTY by default. The single-store stands pin their own country
 * (kerbstone `de`, larchant `fr`, scruple `dk`) and all run `en`, so a built-in
 * "en means the United States" would move a German stand from EUR to USD — a
 * regression for a deployment that never asked for this. The multi-tenant
 * storefront sets `LOCALE_COUNTRY_MAP=ru:ru,en:us`.
 *
 * An explicit country pick by the visitor still outranks this map
 * (`COUNTRY_CHOICE_COOKIE`, `resolveCountry` below) — someone shipping to Germany
 * keeps EUR while reading the shop in Russian.
 */

/** `"ru:ru,en:us"` → `Map { "ru" => "ru", "en" => "us" }`. Junk entries are dropped, not thrown on. */
export const parseLocaleCountryMap = (raw: string): Map<string, string> => {
  const map = new Map<string, string>()

  for (const pair of raw.split(",")) {
    const [locale, country] = pair.split(":").map((part) => part.trim().toLowerCase())

    if (!locale || !country) {
      continue
    }

    map.set(locale, country)
  }

  return map
}

const localeCountryMap = parseLocaleCountryMap(process.env.LOCALE_COUNTRY_MAP ?? "")

/** The configured country for a locale, or null when this deployment maps none. */
export const countryForLocale = (
  locale: string | null | undefined
): string | null => {
  if (!locale) {
    return null
  }

  return localeCountryMap.get(locale.toLowerCase()) ?? null
}

/** True when this deployment maps any locale at all — for tests and diagnostics. */
export const hasLocaleCountryMap = (): boolean => localeCountryMap.size > 0
