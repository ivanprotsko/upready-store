"use server"

import { sdk } from "@lib/config"
import { getCartId } from "@lib/data/cookies"
import type {
  PochtaCity,
  PochtaPointsResponse,
  PochtaQuoteResponse,
} from "@lib/util/pochta"

/**
 * The server-side Russian Post reads (46df-pochta), reached by the checkout
 * through `app/api/pochta/*`, the same split `lib/data/cdek.ts` documents. Not
 * cached: the backend caches the carrier's directory itself, per shop.
 */
export const listPochtaCities = async (term: string): Promise<PochtaCity[]> => {
  if (term.trim().length < 2) return []
  return sdk.client
    .fetch<{ cities: PochtaCity[] }>(`/store/pochta/cities`, {
      method: "GET",
      query: { q: term.trim() },
      cache: "no-store",
    })
    .then((answer) => answer.cities ?? [])
    .catch(() => [])
}

export const listPochtaPoints = async (query: {
  city?: string
  region?: string
}): Promise<PochtaPointsResponse> =>
  sdk.client
    .fetch<PochtaPointsResponse>(`/store/pochta/points`, {
      method: "GET",
      query: { city: query.city || undefined, region: query.region || undefined },
      cache: "no-store",
    })
    .catch(() => ({ configured: false, city: null, points: [] }))

/**
 * The cart is the visitor's own, read from the cart cookie rather than from the
 * request: a quote route that took any cart id would read other visitors'
 * carts.
 */
export const quotePochtaPoint = async (query: {
  index: string
  kind: string
}): Promise<PochtaQuoteResponse> => {
  const cartId = await getCartId()
  if (!cartId) return { configured: true, quote: null }
  return sdk.client
    .fetch<PochtaQuoteResponse>(`/store/pochta/quote`, {
      method: "GET",
      query: {
        cart_id: cartId,
        pochta_point_index: query.index,
        pochta_point_kind: query.kind,
      },
      cache: "no-store",
    })
    .catch(() => ({ configured: true, quote: null }))
}
