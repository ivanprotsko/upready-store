import { isAppLocale, defaultLocale, matchBrowserLocale } from "@i18n/config"
import { resolveCountry, type RegionMap } from "@lib/geolocation"
import { resolveTenantByHost, type ResolvedTenant } from "@lib/tenant/resolve"
import type { HttpTypes } from "@medusajs/types"
import { type NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
/**
 * Single-store fallback only. One storefront process now serves every tenant on
 * the backend and takes the publishable key from the Host (piece 9,
 * docs/multitenancy/storefront-by-host.md §2); this env var is what an unknown
 * host falls back to, which is exactly today's behaviour for a one-shop
 * deployment. It may be unset, and then an unknown host has no key at all.
 */
const PUBLISHABLE_API_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
const LOCALE_COOKIE = "_medusa_locale"

const INTL_LOCALE_HEADER = "X-NEXT-INTL-LOCALE"

/**
 * The tenant of a request, handed to the server components as request headers.
 * They are set by this file and by nothing else: whatever a visitor sends under
 * these names is deleted first, or a browser could ask for another shop's
 * catalog by typing a header.
 */
const TENANT_HEADERS = [
  "x-tenant-key",
  "x-tenant-handle",
  "x-tenant-theme",
  "x-tenant-mode",
] as const

/**
 * Regions are store-wide in Medusa, but the call that reads them needs A key,
 * and each tenant has its own. Keyed by key, so a process serving three shops
 * does not hand the first shop's response to the others and does not refetch
 * per request either.
 */
const regionMapCache = new Map<
  string,
  { regionMap: Map<string, HttpTypes.StoreRegion>; updatedAt: number }
>()

let warnedNoKey = false

async function getRegionMap(
  cacheId: string,
  publishableKey: string | null
): Promise<RegionMap> {
  if (!BACKEND_URL) {
    throw new Error(
      "Middleware.ts: Error fetching regions. Did you set up regions in your Medusa Admin and define a NEXT_PUBLIC_MEDUSA_BACKEND_URL environment variable."
    )
  }

  if (!publishableKey) {
    // No tenant behind this host and no fallback key configured. The Store API
    // answers 400 to every call without one, so there is nothing to fetch —
    // but a throw here would take down every route of every OTHER host served
    // by this process, so the page renders region-less instead.
    if (!warnedNoKey) {
      warnedNoKey = true
      console.error(
        "Middleware.ts: no publishable key for this request (the host resolves to no tenant and NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY is unset). Serving without regions."
      )
    }
    return new Map<string, HttpTypes.StoreRegion>()
  }

  const cached = regionMapCache.get(publishableKey)

  if (cached && cached.updatedAt > Date.now() - 3600 * 1000) {
    return cached.regionMap
  }

  const response = await fetch(`${BACKEND_URL}/store/regions?limit=1000`, {
    method: "GET",
    headers: {
      "x-publishable-api-key": publishableKey,
    },
    next: {
      revalidate: 3600,
      tags: [`regions-${cacheId}`],
    },
    cache: "force-cache",
  })

  if (!response.ok) {
    throw new Error(`Backend returned ${response.status}`)
  }

  const { regions } = await response.json()

  const regionMap = new Map<string, HttpTypes.StoreRegion>()

  if (!regions?.length) {
    return regionMap
  }

  regions.forEach((region: HttpTypes.StoreRegion) => {
    region.countries?.forEach((c) => {
      regionMap.set(c.iso_2 ?? "", region)
    })
  })

  regionMapCache.set(publishableKey, { regionMap, updatedAt: Date.now() })

  return regionMap
}

/** Request headers the route handlers and server components see, tenant included. */
function tenantRequestHeaders(
  request: NextRequest,
  tenant: ResolvedTenant | null
): Headers {
  const headers = new Headers(request.headers)

  for (const name of TENANT_HEADERS) {
    headers.delete(name)
  }

  if (tenant) {
    if (tenant.publishableKey) {
      headers.set("x-tenant-key", tenant.publishableKey)
    }
    headers.set("x-tenant-handle", tenant.handle)
    if (tenant.theme) {
      headers.set("x-tenant-theme", tenant.theme)
    }
    if (tenant.mode) {
      headers.set("x-tenant-mode", tenant.mode)
    }
  }

  return headers
}

export async function middleware(request: NextRequest) {
  // Which shop, before anything else: the key every downstream fetch needs and
  // the theme the layout paints both come from here (piece 9). A host with no
  // tenant answers null and the storefront stays in single-store mode.
  const tenant = await resolveTenantByHost(
    BACKEND_URL,
    request.headers.get("host")
  )
  const publishableKey = tenant?.publishableKey ?? PUBLISHABLE_API_KEY ?? null
  const requestHeaders = tenantRequestHeaders(request, tenant)
  const nextWithTenant = () =>
    NextResponse.next({ request: { headers: requestHeaders } })

  if (request.nextUrl.pathname.includes(".")) {
    return nextWithTenant()
  }

  const cacheIdCookie = request.cookies.get("_medusa_cache_id")
  const cacheId = cacheIdCookie?.value || crypto.randomUUID()
  const regionMap: RegionMap = await getRegionMap(cacheId, publishableKey)

  // Region detection is owned by @lib/geolocation. It reads the visitor's
  // country from the _medusa_country cookie, or resolves it through the
  // configured geolocation provider, and returns a function that writes the
  // cookie (plus the x-geo-* debug headers) onto the response we return below.
  const applyCountry = await resolveCountry(request, regionMap)

  const segments = request.nextUrl.pathname.split("/").filter(Boolean)
  const firstSegment = segments[0]
  const hasLocaleInUrl = firstSegment && isAppLocale(firstSegment)

  const persistentCookieOpts = {
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: false,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  }

  function withCookies(res: NextResponse, locale: string): NextResponse {
    if (!cacheIdCookie) {
      res.cookies.set("_medusa_cache_id", cacheId, { maxAge: 60 * 60 * 24 })
    }
    res.cookies.set(LOCALE_COOKIE, locale, persistentCookieOpts)
    return applyCountry(res)
  }

  if (hasLocaleInUrl) {
    const locale = firstSegment

    // Every page under /account beyond the entry point belongs to a signed-in
    // customer, and the account layout only renders the sign-in form for
    // /account itself. Send a signed-out visitor there rather than letting the
    // parallel route fall through to a 404.
    if (
      segments[1] === "account" &&
      segments.length > 2 &&
      !request.cookies.get("_medusa_jwt")
    ) {
      const res = NextResponse.redirect(
        new URL(`/${locale}/account`, request.url)
      )
      return withCookies(res, locale)
    }

    const res = nextWithTenant()
    res.headers.set(INTL_LOCALE_HEADER, locale)
    return withCookies(res, locale)
  }

  // No locale in URL — detect and redirect 302
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value

  const locale =
    cookieLocale && isAppLocale(cookieLocale)
      ? cookieLocale
      : (matchBrowserLocale(request.headers.get("accept-language")) ??
        defaultLocale)

  const trailingPath =
    request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname
  const redirectUrl = new URL(`/${locale}${trailingPath}${request.nextUrl.search}`, request.url)
  const res = NextResponse.redirect(redirectUrl, 302)
  return withCookies(res, locale)
}

export const config = {
  matcher: [
    "/((?!api|healthz|_next/static|_next/image|favicon.ico|images|assets|png|svg|jpg|jpeg|gif|webp).*)",
  ],
}
