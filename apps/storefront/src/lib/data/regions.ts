"use server"

import { sdk } from "@lib/config"
import type { HttpTypes } from "@medusajs/types"
import { narrowRegions } from "@lib/geolocation/shop-regions"
import {
  getCacheOptions,
  getShopRegionIds,
  getTenantHandle,
  hasResolvedCountry,
} from "./cookies"
import { siteWideRead } from "./site-wide"

/**
 * Site-wide: the nav's region and currency switchers read this on every route
 * under `(main)`, so it follows the same rule as the category tree and never
 * throws into a layout render (`lib/data/site-wide.ts`). An empty list leaves
 * the switcher with nothing to offer; a throw replaced the whole page with
 * `Application error`.
 */
export const listRegions = async () => {
  const next = {
    ...(await getCacheOptions("regions")),
  }

  return siteWideRead<HttpTypes.StoreRegion[]>(
    "listRegions /store/regions",
    () =>
      sdk.client
        .fetch<{ regions: HttpTypes.StoreRegion[] }>(`/store/regions`, {
          method: "GET",
          query: { limit: 1000 },
          next,
          cache: "force-cache",
        })
        .then(({ regions }) => regions),
    []
  )
}

/**
 * The regions THIS shop sells in (N9, t-2026-10-04-19): what the region
 * switcher and the checkout's country list offer, so a buyer can no longer
 * pick a region the shop has no prices in. `listRegions` stays the whole
 * store-wide list for everything that is not a pick of the shop's currency —
 * `getRegion` among them, which prices a country the middleware has already
 * kept inside these.
 *
 * t-2026-10-08-13, part A7b: the middleware narrows them only for a path it
 * treats as a page. A path with a dot (`/humans.txt`, `/ru/products/abc.html`)
 * reaches the shop's header with its name and key and with no narrowing, and
 * «nothing narrows them» then meant all of the engine's regions: the 404 of a
 * live shop carried 241 countries and their currencies in its code. A shop's
 * request the middleware resolved no country for gets no region at all, the
 * state the switcher already has for a failed read.
 */
export const listShopRegions = async () => {
  const [handle, resolved] = await Promise.all([
    getTenantHandle(),
    hasResolvedCountry(),
  ])

  if (handle && !resolved) {
    return []
  }

  const [regions, ids] = await Promise.all([listRegions(), getShopRegionIds()])

  return narrowRegions(regions, ids)
}

/**
 * Whether `regionId` is one of the shop's own (`listShopRegions`); true when
 * nothing narrows them.
 */
export const isShopRegion = async (regionId: string) => {
  const ids = await getShopRegionIds()

  return !ids || ids.includes(regionId)
}

export const retrieveRegion = async (id: string) => {
  const next = {
    ...(await getCacheOptions(["regions", id].join("-"))),
  }

  return await sdk.client
    .fetch<{ region: HttpTypes.StoreRegion }>(`/store/regions/${id}`, {
      method: "GET",
      next,
      cache: "force-cache",
    })
    .then(({ region }) => region)
}

const regionMap = new Map<string, HttpTypes.StoreRegion>()

export const getRegion = async (countryCode: string) => {
  if (regionMap.has(countryCode)) {
    return regionMap.get(countryCode)
  }

  const regions = await listRegions()

  if (!regions) {
    return null
  }

  regions.forEach((region) => {
    region.countries?.forEach((c) => {
      regionMap.set(c?.iso_2 ?? "", region)
    })
  })

  const region = countryCode ? regionMap.get(countryCode) : regionMap.get("ru")

  return region
}
