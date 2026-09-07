import { DEFAULT_REGION } from "@lib/util/env"
import type { HttpTypes } from "@medusajs/types"
import type { NextRequest, NextResponse } from "next/server"
import { detectCountry } from "./detect"

export const COUNTRY_COOKIE = "_medusa_country"

/**
 * Set by `setCountryCode`, whose only caller is `updateRegion` — the region
 * switcher. It marks the country cookie as an EXPLICIT choice, so a pinned
 * deployment can override a country that DETECTION wrote without overriding one
 * the visitor picked.
 */
export const COUNTRY_CHOICE_COOKIE = "_medusa_country_choice"

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

export type RegionMap = Map<string, HttpTypes.StoreRegion>

export type ApplyCountry = (res: NextResponse) => NextResponse

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
  regionMap: RegionMap
): Promise<Resolution> => {
  const existing = request.cookies.get(COUNTRY_COOKIE)?.value
  const chosen = request.cookies.get(COUNTRY_CHOICE_COOKIE)?.value === "1"

  if (existing && regionMap.has(existing) && (chosen || !REGION_PINNED)) {
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
  regionMap: RegionMap
): Promise<ApplyCountry> => {
  const resolution = await resolve(request, regionMap)

  return (res) => {
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
}
