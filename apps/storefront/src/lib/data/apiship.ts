"use server"

import { sdk } from "@lib/config"
import type { ApishipPointsResponse } from "@lib/util/apiship"

/**
 * The server-side ApiShip read (t-2026-10-14-58, part B). The checkout reaches it
 * through the route handler in `app/api/apiship/points`, for the reason
 * `lib/data/cdek.ts` gives: the picker fetches as the buyer types a city, and a
 * Next server ACTION would queue behind whatever else the page is doing.
 *
 * Not cached: the answer is the shop's own carrier points, and the cache tag
 * `getCacheOptions` builds can never be revalidated (see `lib/data/cdek.ts`).
 *
 * The publishable key comes from the request's Host header (`lib/config.ts`),
 * never from an argument: the points come from the shop's OWN ApiShip token.
 */
export const listApishipPoints = async (query: {
  providerKey: string
  city: string
}): Promise<ApishipPointsResponse> =>
  sdk.client
    .fetch<ApishipPointsResponse>(`/store/apiship/points`, {
      method: "GET",
      query: { provider_key: query.providerKey, city: query.city },
      cache: "no-store",
    })
    .catch(() => ({ configured: false, provider_key: null, city: null, total: 0, points: [] }))
