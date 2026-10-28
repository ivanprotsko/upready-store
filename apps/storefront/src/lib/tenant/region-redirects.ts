/**
 * The region popup (t-2026-10-20-22). Ivan, 20.10.2026: «нужно сделать попап с
 * выбором региона и если человек выбирает "россия", то пусть выполняется
 * переадресация на сайт cherkashino.ru».
 *
 * The backend reads the shop's own `metadata.region_redirects`
 * (`/storefront/by-host` → `region_redirects`, a list of a country and the other
 * shop's home) and the middleware carries it on `x-tenant-region-redirects`. A
 * shop without it gets no header and no popup.
 */

export type RegionRedirect = { country: string; url: string }

/** The visitor's answer: a country code, or `other`. A year, so the popup does not come back. */
export const REGION_CHOICE_COOKIE = "_region_choice"
export const REGION_CHOICE_MAX_AGE = 60 * 60 * 24 * 365
/** Closed without an answer: asked again on the next visit, not on the next page. */
export const REGION_CHOICE_DISMISSED = "dismissed"
export const REGION_CHOICE_OTHER = "other"

/** At most this many of the shop's countries are listed; past it only Kazakhstan, then «Другая страна». */
export const POPUP_COUNTRY_LIMIT = 6
const FEATURED_COUNTRY = "kz"

/** Only a two-letter country and an http(s) address, as the backend answers them. */
export const readRegionRedirects = (value: unknown): RegionRedirect[] => {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") {
      return []
    }
    const { country, url } = row as Record<string, unknown>
    if (
      typeof country !== "string" ||
      !/^[a-z]{2}$/.test(country) ||
      typeof url !== "string"
    ) {
      return []
    }
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return []
      }
      return [{ country, url: `${parsed.origin}/` }]
    } catch {
      return []
    }
  })
}

export const parseRegionRedirectsHeader = (
  value: string | null
): RegionRedirect[] => {
  if (!value) {
    return []
  }
  try {
    return readRegionRedirects(JSON.parse(value))
  } catch {
    return []
  }
}

/**
 * Search robots and link-preview fetchers. They never see the popup: the page
 * they index or the card they draw is the shop itself. `bot` stands as a word or
 * before a slash, so a phone model such as «CUBOT_X30» is not read as one.
 */
const BOT_USER_AGENT =
  /bot\b|bot\/|crawl|spider|slurp|preview|facebookexternalhit|facebookcatalog|whatsapp|vkshare|embedly|pinterest|yandex(?!browser)|google-inspectiontool|lighthouse|chrome-lighthouse/i

export const isBotUserAgent = (userAgent: string | null | undefined): boolean =>
  !userAgent || BOT_USER_AGENT.test(userAgent)

/** Whether this request opens with the popup: a shop with a redirect, a person, and no answer yet. */
export const shouldAskRegion = ({
  redirects,
  choice,
  userAgent,
}: {
  redirects: RegionRedirect[]
  choice: string | null | undefined
  userAgent: string | null | undefined
}): boolean => redirects.length > 0 && !choice && !isBotUserAgent(userAgent)

/**
 * The countries the popup offers to stay with, without the ones that go to
 * another shop. Kazakhstan always comes first, served or not (the brief: «at
 * least Kazakhstan»); then the shop's other countries when there are at most
 * `POPUP_COUNTRY_LIMIT`, none past it. The whole list stays in the header's
 * region switcher.
 */
export const popupCountriesOf = (
  shopCountries: string[],
  redirects: RegionRedirect[]
): string[] => {
  const away = new Set(redirects.map((r) => r.country))
  const own = Array.from(
    new Set(shopCountries.map((c) => c.toLowerCase()))
  ).filter((c) => c && !away.has(c))
  const featured = away.has(FEATURED_COUNTRY) ? [] : [FEATURED_COUNTRY]
  const rest = own.filter((c) => c !== FEATURED_COUNTRY)
  return rest.length <= POPUP_COUNTRY_LIMIT ? [...featured, ...rest] : featured
}

/** The cookie line the browser writes for an answer. `dismissed` lives for the session only. */
export const regionChoiceCookie = (choice: string, secure: boolean): string =>
  [
    `${REGION_CHOICE_COOKIE}=${encodeURIComponent(choice)}`,
    "Path=/",
    "SameSite=Lax",
    ...(choice === REGION_CHOICE_DISMISSED
      ? []
      : [`Max-Age=${REGION_CHOICE_MAX_AGE}`]),
    ...(secure ? ["Secure"] : []),
  ].join("; ")
