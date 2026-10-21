import { DEFAULT_REGION } from "@lib/util/env"
import type { HttpTypes } from "@medusajs/types"
import type { NextRequest, NextResponse } from "next/server"
import { detectCountry } from "./detect"
import { countryForLocale } from "./locale-country"

export {
  countryForLocale,
  hasLocaleCountryMap,
  parseLocaleCountryMap,
} from "./locale-country"
export {
  narrowRegionMap,
  narrowRegions,
  shopRegionIds,
  shopRegionsNarrowed,
} from "./shop-regions"

export const COUNTRY_COOKIE = "_medusa_country"

/**
 * The country of THIS request, handed to the server components as a request
 * header rather than only as a response cookie. The cookie is written on the way
 * out, so on a visitor's first request the components that price a product would
 * otherwise read the country of the PREVIOUS visit (or none at all) and paint one
 * page in the wrong currency before settling. The header is written in the same
 * middleware pass that resolves it.
 */
export const COUNTRY_HEADER = "x-storefront-country"

/**
 * Set by `setCountryCode`, whose only caller is `updateRegion` — the region
 * switcher. It marks the country cookie as an EXPLICIT choice, so a pinned
 * deployment can override a country that DETECTION wrote without overriding one
 * the visitor picked.
 */
export const COUNTRY_CHOICE_COOKIE = "_medusa_country_choice"

/**
 * The ids of the regions THIS shop sells in (`shopRegionIds`, N9), comma
 * separated, for the region switcher, the checkout's country list and
 * `applyRegion`. Absent when nothing narrows them. Written by the middleware in
 * the same pass that resolves the country, and deleted from the incoming
 * request first, like `COUNTRY_HEADER`: a forged list would offer a region the
 * shop has no prices in.
 */
export const SHOP_REGIONS_HEADER = "x-storefront-regions"

const RESOLVED_MAX_AGE = 60 * 60 * 24 * 365
const UNRESOLVED_MAX_AGE = 60 * 5
const DEBUG = process.env.GEOLOCATION_DEBUG === "true"

/**
 * A stand — dev, preview, demo — is opened from wherever the machine happens to
 * sit, so its IP says nothing about the shopper. Every stand of this wave
 * resolved to Indonesia through ip-api and rendered "458 199 IDR" while
 * NEXT_PUBLIC_DEFAULT_REGION said otherwise, because detection outranks the
 * configured default and then writes a year-long cookie that survives the next
 * visit.
 *
 * When the region is PINNED the configured default wins over both detection and
 * a cookie detection wrote earlier. An explicit choice (COUNTRY_CHOICE_COOKIE)
 * still wins, so the region switcher keeps working.
 *
 * Default: pinned outside production, where the machine's location is the
 * developer's and not a signal. `REGION_PIN=false` restores detection locally;
 * `REGION_PIN=true` pins a production deployment to one region.
 */
const REGION_PINNED = process.env.REGION_PIN
  ? process.env.REGION_PIN === "true"
  : process.env.NODE_ENV !== "production"

/**
 * The country every request lands on when its locale names none, or null when
 * the deployment leaves that to detection — the last link of the chain
 * `shopRegionIds` walks.
 */
export const pinnedRegionCountry = (): string | null =>
  REGION_PINNED ? DEFAULT_REGION : null

export type RegionMap = Map<string, HttpTypes.StoreRegion>

export type ApplyCountry = (res: NextResponse) => NextResponse

/** What `resolveCountry` settled on: the country itself, plus the writer for the response. */
export type CountryResolution = {
  countryCode: string
  apply: ApplyCountry
}

type Resolution = {
  countryCode: string
  resolved: boolean
  source: string
  detected: string | null
  provider: string
  ip: string
}

const fromCookie = (countryCode: string): Resolution => ({
  countryCode,
  resolved: true,
  source: "cookie",
  detected: null,
  provider: "none",
  ip: "none",
})

const fromLocale = (countryCode: string): Resolution => ({
  countryCode,
  resolved: true,
  source: "locale",
  detected: null,
  provider: "locale-map",
  ip: "none",
})

const pinned = (): Resolution => ({
  countryCode: DEFAULT_REGION,
  resolved: true,
  source: "pinned-default",
  detected: null,
  provider: "pinned",
  ip: "none",
})

const resolve = async (
  request: NextRequest,
  regionMap: RegionMap,
  locale: string | null,
  localeCountryMap?: Map<string, string> | null
): Promise<Resolution> => {
  const existing = request.cookies.get(COUNTRY_COOKIE)?.value
  const chosen = request.cookies.get(COUNTRY_CHOICE_COOKIE)?.value === "1"

  // An explicit pick by the visitor is the top of the order, ahead of the locale
  // map and the pin alike: someone shipping to Germany keeps EUR whichever
  // language they read the shop in.
  if (existing && regionMap.has(existing) && chosen) {
    return fromCookie(existing)
  }

  // The locale of the page being served, when this deployment (or this TENANT,
  // `localeCountryMap` — t06-locale-currency) maps one. Above the pin, because
  // the pin names ONE country for the whole deployment and the map is what
  // makes /ru and /en differ.
  const mapped = countryForLocale(locale, localeCountryMap)

  if (mapped && regionMap.has(mapped)) {
    return fromLocale(mapped)
  }

  // No map configured (every deployment before this change) — exactly the
  // previous behaviour: a cookie detection wrote earlier is honoured unless the
  // deployment is pinned.
  if (existing && regionMap.has(existing) && !REGION_PINNED) {
    return fromCookie(existing)
  }

  // A pin that names a country the backend has no region for cannot be honoured;
  // falling through to detection is better than serving an arbitrary region.
  if (REGION_PINNED && regionMap.has(DEFAULT_REGION)) {
    return pinned()
  }

  const { countryCode: detected, provider, ip } = await detectCountry(request)
  const base = { detected, provider, ip }

  if (detected && regionMap.has(detected)) {
    return { ...base, countryCode: detected, resolved: true, source: "detected" }
  }

  const suffix = detected ? "-no-region" : ""

  if (regionMap.has(DEFAULT_REGION)) {
    return {
      ...base,
      countryCode: DEFAULT_REGION,
      resolved: false,
      source: `fallback-default${suffix}`,
    }
  }

  return {
    ...base,
    countryCode: regionMap.keys().next().value ?? DEFAULT_REGION,
    resolved: false,
    source: `fallback-first${suffix}`,
  }
}

export const resolveCountry = async (
  request: NextRequest,
  regionMap: RegionMap,
  locale: string | null = null,
  localeCountryMap: Map<string, string> | null = null
): Promise<CountryResolution> => {
  const resolution = await resolve(request, regionMap, locale, localeCountryMap)

  const apply: ApplyCountry = (res) => {
    res.cookies.set(COUNTRY_COOKIE, resolution.countryCode, {
      maxAge: resolution.resolved ? RESOLVED_MAX_AGE : UNRESOLVED_MAX_AGE,
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    })

    if (DEBUG) {
      res.headers.set("x-geo-source", resolution.source)
      res.headers.set("x-geo-country", resolution.countryCode)
      res.headers.set("x-geo-detected", resolution.detected ?? "none")
      res.headers.set("x-geo-provider", resolution.provider)
      res.headers.set("x-geo-client-ip", resolution.ip)
    }

    return res
  }

  return { countryCode: resolution.countryCode, apply }
}
