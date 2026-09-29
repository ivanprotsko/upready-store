import type { HttpTypes } from "@medusajs/types"

/**
 * The Russian Post side of the checkout, in one place (46df-pochta). Plain
 * constants and pure functions, not in `lib/data/pochta.ts`, for the reason
 * `lib/util/cdek.ts` gives: a `"use server"` file may export async functions
 * only.
 */

/** Provider id of `apps/backend/src/modules/pochta-fulfillment`. */
export const POCHTA_PROVIDER_ID = "pochta_pochta"

export type PochtaPointKind = "pvz" | "office"

/** One pickup point, as `/store/pochta/points` answers it. */
export type PochtaStorePoint = {
  index: string
  kind: PochtaPointKind
  name: string
  address: string
  city: string | null
  region: string | null
  lat: number
  lng: number
  work_time: string[]
  weight_limit_g: number | null
  card_payment: boolean | null
  cash_payment: boolean | null
  directions: string | null
}

export type PochtaCity = {
  name: string
  region: string | null
  points: number
  lat: number
  lng: number
}

export type PochtaPointsResponse = {
  configured: boolean
  city: { name: string; region: string | null; lat: number; lng: number } | null
  points: PochtaStorePoint[]
}

export type PochtaTariffSource = "otpravka" | "public-retail" | "public-retail-estimate"

export type PochtaQuote = {
  amount: number
  carrier_amount: number
  period_min: number
  period_max: number
  term_label: string
  tariff_source: PochtaTariffSource
  weight_g: number
}

export type PochtaQuoteResponse = {
  configured: boolean
  currency_code?: string
  quote: PochtaQuote | null
  error?: string
}

/**
 * The price and term a pickup point shows in the point sheet. The amount is
 * the one the buyer pays for any tariff source: choosing the point prices the
 * shipping method with the same quote. `public-retail-estimate` says the SHOP's
 * own postage to a «Почта Еком» point is approximate, which the owner reads in
 * the panel. Shown to the buyer as «≈ … Предварительно» it made a fixed price
 * look like it could still change (U-10, 46df UX audit).
 */
export const pochtaQuoteLabel = (
  quote: PochtaQuote,
  priceLabel: (amount: number) => string
): string => [priceLabel(quote.amount), quote.term_label].filter(Boolean).join(" · ")

type OptionWithProvider = { provider_id?: string | null }

export const isPochtaOption = (option?: OptionWithProvider | null): boolean =>
  option?.provider_id === POCHTA_PROVIDER_ID

/** What the provider wrote on the cart's (or the order's) shipping method. */
export type PochtaMethodData = {
  provider: "pochta"
  pochta_point_index: string
  pochta_point_kind: PochtaPointKind
  pochta_point_name: string | null
  pochta_point_address: string | null
  pochta_point_city: string | null
  pochta_point_region: string | null
  tariff_source: PochtaTariffSource | null
  term_label: string | null
}

/**
 * The point on the cart's (or the order's) shipping method, or `null`. Only
 * data the provider wrote counts (`provider: "pochta"`): the storefront sends
 * an index, the server fills in the rest from the carrier's directory.
 */
export const pochtaPointOf = (
  entity?: { shipping_methods?: Array<{ data?: unknown } | null> | null } | null
): PochtaMethodData | null => {
  for (const method of entity?.shipping_methods ?? []) {
    const data = method?.data as Partial<PochtaMethodData> | null | undefined
    if (data?.provider === "pochta" && typeof data.pochta_point_index === "string") {
      return {
        provider: "pochta",
        pochta_point_index: data.pochta_point_index,
        pochta_point_kind: data.pochta_point_kind === "office" ? "office" : "pvz",
        pochta_point_name: data.pochta_point_name ?? null,
        pochta_point_address: data.pochta_point_address ?? null,
        pochta_point_city: data.pochta_point_city ?? null,
        pochta_point_region: data.pochta_point_region ?? null,
        tariff_source: data.tariff_source ?? null,
        term_label: data.term_label ?? null,
      }
    }
  }
  return null
}

/**
 * The carrier's week («пн, открыто: 09:00 - 21:00», one line a day) folded into
 * runs of days with the same hours: «пн–пт 09:00 - 21:00; сб–вс 10:00 - 18:00».
 * A line that does not follow the pattern is kept as it is.
 */
export const compactWorkTime = (lines: string[]): string => {
  const parsed = lines.map((line) => {
    const match = line.match(/^\s*([а-яё]{2}),\s*(.+?)\s*$/i)
    return match ? { day: match[1], hours: match[2].replace(/^открыто:\s*/i, "") } : null
  })
  if (!parsed.length || parsed.some((entry) => !entry)) return lines.join("; ")
  const runs: Array<{ from: string; to: string; hours: string }> = []
  for (const entry of parsed as Array<{ day: string; hours: string }>) {
    const last = runs[runs.length - 1]
    if (last && last.hours === entry.hours) last.to = entry.day
    else runs.push({ from: entry.day, to: entry.day, hours: entry.hours })
  }
  return runs
    .map((run) => `${run.from === run.to ? run.from : `${run.from}–${run.to}`} ${run.hours}`)
    .join("; ")
}

export const chosenPochtaPoint = (cart?: HttpTypes.StoreCart | null) => pochtaPointOf(cart)

/** The city a point search starts from: the one the buyer's address names. */
export const cityForPochtaSearch = (cart?: HttpTypes.StoreCart | null): string =>
  (cart?.shipping_address?.city ?? "").trim()

/**
 * The browser-side reads of the picker. They call this storefront's own route
 * handlers, never the Store API directly (the publishable key belongs to the
 * request's host), and swallow a failure into an empty answer so the sheet
 * shows its own copy instead of a stack trace.
 */
export const fetchPochtaCities = async (term: string, signal?: AbortSignal): Promise<PochtaCity[]> => {
  if (term.trim().length < 2) return []
  try {
    const response = await fetch(`/api/pochta/cities?q=${encodeURIComponent(term.trim())}`, { signal })
    if (!response.ok) return []
    const answer = (await response.json()) as { cities?: PochtaCity[] }
    return answer.cities ?? []
  } catch {
    return []
  }
}

export const fetchPochtaPoints = async (
  query: { city: string; region?: string | null },
  signal?: AbortSignal
): Promise<PochtaPointsResponse> => {
  const search = new URLSearchParams({ city: query.city })
  if (query.region) search.set("region", query.region)
  try {
    const response = await fetch(`/api/pochta/points?${search.toString()}`, { signal })
    if (!response.ok) return { configured: false, city: null, points: [] }
    return (await response.json()) as PochtaPointsResponse
  } catch {
    return { configured: false, city: null, points: [] }
  }
}

export const fetchPochtaQuote = async (
  query: { index: string; kind: PochtaPointKind },
  signal?: AbortSignal
): Promise<PochtaQuoteResponse> => {
  const search = new URLSearchParams({
    pochta_point_index: query.index,
    pochta_point_kind: query.kind,
  })
  try {
    const response = await fetch(`/api/pochta/quote?${search.toString()}`, { signal })
    if (!response.ok) return { configured: true, quote: null }
    return (await response.json()) as PochtaQuoteResponse
  } catch {
    return { configured: true, quote: null }
  }
}
