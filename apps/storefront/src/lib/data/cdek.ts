"use server"

import { sdk } from "@lib/config"
import type { CdekStorePoint } from "@lib/util/cdek"
import { getCacheOptions } from "./cookies"

export type CdekPointsResponse = {
  configured: boolean
  city: { code: number; name: string | null } | null
  points: CdekStorePoint[]
}

/**
 * The shop's CDEK pickup points for one city (`GET /store/cdek/points`,
 * i02-apiship-cdek-shipping).
 *
 * Not cached with `force-cache`: `getCacheOptions` builds its tag around
 * `_medusa_cache_id`, a random UUID per visitor, so no `revalidateTag` can ever
 * name it and a cached answer would outlive the process (measured in
 * i01-robokassa-checkout). The tag is passed anyway, so this call joins the same
 * revalidation family as the rest of fulfillment once that is fixed centrally.
 */
export const listCdekPoints = async (query: {
  city?: string
  city_code?: number
  postal_code?: string
  type?: "PVZ" | "POSTAMAT" | "ALL"
}): Promise<CdekPointsResponse> => {
  const next = {
    ...(await getCacheOptions("fulfillment")),
  }

  return sdk.client
    .fetch<CdekPointsResponse>(`/store/cdek/points`, {
      method: "GET",
      query: {
        city: query.city || undefined,
        city_code: query.city_code || undefined,
        postal_code: query.postal_code || undefined,
        type: query.type ?? "PVZ",
      },
      next,
      cache: "no-store",
    })
    .catch(() => ({ configured: false, city: null, points: [] }))
}

export type CdekCity = {
  code: number
  city: string
  region: string | null
  lat: number | null
  lng: number | null
}

/** CDEK's own city directory, for the point sheet's city field. */
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
