"use server"

import { sdk } from "@lib/config"
import type { CdekCity, CdekPointsResponse } from "@lib/util/cdek"

/**
 * The server-side CDEK reads (i02-apiship-cdek-shipping). The checkout reaches
 * them through the route handlers in `app/api/cdek/*`, which is where the
 * browser-visible half lives (`fetchCdekPoints` / `fetchCdekCities` in
 * `lib/util/cdek.ts`, i03-checkout-pvz-map-address-suggest): the picker fetches
 * on every few keystrokes and a Next server ACTION would queue behind whatever
 * else the page is doing.
 *
 * Not cached with `force-cache`: `getCacheOptions` builds its tag around
 * `_medusa_cache_id`, a random UUID per visitor, so no `revalidateTag` can ever
 * name it and a cached answer would outlive the process (measured in
 * i01-robokassa-checkout).
 *
 * The publishable key comes from the request's Host header (`lib/config.ts`),
 * never from an argument: the points come from the shop's OWN CDEK account.
 */
export const listCdekPoints = async (query: {
  city?: string
  city_code?: number
  postal_code?: string
  type?: "PVZ" | "POSTAMAT" | "ALL"
}): Promise<CdekPointsResponse> =>
  sdk.client
    .fetch<CdekPointsResponse>(`/store/cdek/points`, {
      method: "GET",
      query: {
        city: query.city || undefined,
        city_code: query.city_code || undefined,
        postal_code: query.postal_code || undefined,
        type: query.type ?? "PVZ",
      },
      cache: "no-store",
    })
    .catch(() => ({ configured: false, city: null, points: [] }))

/** CDEK's own city directory, for the checkout's city suggest fields. */
export const listCdekCities = async (term: string): Promise<CdekCity[]> => {
  if (term.trim().length < 2) return []
  return sdk.client
    .fetch<{ cities: CdekCity[] }>(`/store/cdek/cities`, {
      method: "GET",
      query: { q: term.trim() },
      cache: "no-store",
    })
    .then((answer) => answer.cities ?? [])
    .catch(() => [])
}
