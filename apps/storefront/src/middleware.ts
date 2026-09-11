import {
  LOCALE_CHOICE_COOKIE,
  LOCALE_COOKIE,
  defaultLocale,
  isAppLocale,
  matchBrowserLocale,
} from "@i18n/config"
import { COUNTRY_HEADER, resolveCountry, type RegionMap } from "@lib/geolocation"
import {
  TENANT_HEADERS,
  encodeTenantHeaderValue,
} from "@lib/tenant/headers"
import { originForHost, requestOrigin } from "@lib/tenant/origin"
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

/**
 * Pin the entry locale to `defaultLocale` instead of negotiating it with the
 * browser. The same shape as `REGION_PIN` in `@lib/geolocation`, and for the same
 * kind of reason: which language a shop opens in is a property of the DEPLOYMENT,
 * not of the code.
 *
 * `false` (the default) keeps the rule of `t-2026-09-10-01`: the whole
 * Accept-Language list is parsed, a `preferredLocales` entry wins wherever it
 * stands, otherwise the visitor's own order decides. That is what the five
 * single-store stands run.
 *
 * `true` is the multi-tenant storefront (Ivan's order 4.1, 2026-09-12): its
 * audience is Russian-speaking, so a visitor arriving without a locale in the URL
 * gets `defaultLocale` whatever their browser sends. A pick in the language
 * switcher (`LOCALE_CHOICE_COOKIE`) still outranks the pin — a pin is a default,
 * not a cage.
 */
const LOCALE_PINNED = process.env.LOCALE_PIN === "true"

/**
 * Hosts that carry the paywall→onboarding DEMO instead of a shop
 * (`t-2026-09-12-paywall-onboarding-demo`). They resolve to no tenant, and an
 * unknown host is exactly defect A2 — measured on this deployment, `/` on such
 * a host answers 302 to `/en` and `/en` answers 500, because every page under
 * `[locale]` needs a publishable key the host cannot produce. So a demo host
 * never enters `[locale]` at all: it is redirected to `/start`, which lives
 * outside it and fetches nothing from the Store API.
 *
 * Comma-separated, lowercase, no scheme and no port (`shiftship.dev,www.shiftship.dev`).
 * Empty — the default — means no host behaves this way, which is every other
 * deployment of this image.
 */
const DEMO_HOSTS = (process.env.DEMO_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean)

/** The demo is drawn on the Geist canon, whatever profile this image was built for. */
const DEMO_THEME = "geist"
const DEMO_MODE = "light"

function isDemoHost(host: string | null): boolean {
  if (!host || DEMO_HOSTS.length === 0) return false
  return DEMO_HOSTS.includes(host.split(":")[0].toLowerCase())
}

function demoHostResponse(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers)
  // Same rule as tenantRequestHeaders: whatever a visitor sends under these
  // names is deleted before ours are written.
  for (const name of TENANT_HEADERS) {
    headers.delete(name)
  }
  headers.set("x-tenant-theme", encodeTenantHeaderValue(DEMO_THEME))
  headers.set("x-tenant-mode", encodeTenantHeaderValue(DEMO_MODE))

  const { pathname } = request.nextUrl
  // A file request (`.ico`, `.png`, a source map) is served as-is; everything
  // else on this host is the demo, including the `/en` a crawler or an old
  // bookmark asks for.
  if (pathname === "/start" || pathname.startsWith("/start/") || pathname.includes(".")) {
    return NextResponse.next({ request: { headers } })
  }

  return NextResponse.redirect(new URL("/start", request.url), 307)
}

const INTL_LOCALE_HEADER = "X-NEXT-INTL-LOCALE"

/*
 * The tenant of a request, handed to the server components as request headers.
 * The names and the percent-encoding both live in `@lib/tenant/headers`, because
 * the readers need the same pair — a header value is a ByteString and a tenant
 * named in Cyrillic would otherwise throw here and answer 500 for the whole shop.
 */

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

/**
 * A request that arrived on any address of the shop OTHER than its main one —
 * the handle it used to answer on, its technical `<tenant_id>` address, its
 * platform subdomain once a custom domain became primary — is answered with a
 * permanent redirect to the SAME page of the main address
 * (`specs/tenant-address/CANONICAL.md` §1.2, §1.3).
 *
 * Page for page, not everything to the home page: a redirect to `/` throws away
 * the link someone actually shared and, with it, most of what the old address
 * had earned. 301 rather than 302 because the move is permanent and that is what
 * carries the accumulated weight over.
 *
 * `X-Robots-Tag: noindex` rides along so that even the redirect itself, and any
 * page ever served from a non-main address, stays out of the index — the
 * `<tenant_id>` address exists for support and monitoring, never for search.
 *
 * Null when there is nothing to redirect: no tenant (single-store), no main
 * address known, or this request is already on it.
 */
function primaryHostRedirect(
  request: NextRequest,
  tenant: ResolvedTenant | null
): NextResponse | null {
  const primary = tenant?.primaryHost

  if (!primary) {
    return null
  }

  const rawHost = (request.headers.get("host") ?? "").trim().toLowerCase()
  const hostname = rawHost.replace(/:\d+$/, "").replace(/\.$/, "")

  if (!hostname || hostname === primary) {
    return null
  }

  const origin = originForHost(request.headers, request.nextUrl.protocol, primary)

  if (!origin) {
    return null
  }

  const response = NextResponse.redirect(
    `${origin}${request.nextUrl.pathname}${request.nextUrl.search}`,
    301
  )
  response.headers.set("X-Robots-Tag", "noindex")

  return response
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

  // Whatever a visitor sends under this name is deleted before we write ours:
  // the country decides the currency, and a forged header would price the page.
  headers.delete(COUNTRY_HEADER)

  if (tenant) {
    if (tenant.publishableKey) {
      headers.set("x-tenant-key", encodeTenantHeaderValue(tenant.publishableKey))
    }
    headers.set("x-tenant-handle", encodeTenantHeaderValue(tenant.handle))
    headers.set("x-tenant-name", encodeTenantHeaderValue(tenant.name))
    if (tenant.theme) {
      headers.set("x-tenant-theme", encodeTenantHeaderValue(tenant.theme))
    }
    if (tenant.mode) {
      headers.set("x-tenant-mode", encodeTenantHeaderValue(tenant.mode))
    }
    // The origin the shop was resolved FROM, for every absolute URL a page emits
    // (canonical, hreflang, JSON-LD, sitemap, robots, llms.txt, Open Graph).
    // `NEXT_PUBLIC_BASE_URL` is one value baked into the image for every shop this
    // process serves, so it can name at most one of them — `lib/tenant/origin.ts`.
    // The shop's MAIN address, not the host this request happened to arrive on:
    // one source for canonical, hreflang, sitemap, robots, JSON-LD and og:url
    // (`specs/tenant-address/CANONICAL.md` §1.1). In practice the two are equal,
    // because a request on any other address of the shop is redirected below —
    // but the page must name the main address even if it is ever served from
    // somewhere else.
    const origin = tenant.primaryHost
      ? originForHost(
          request.headers,
          request.nextUrl.protocol,
          tenant.primaryHost
        )
      : requestOrigin(request.headers, request.nextUrl.protocol)
    if (origin) {
      headers.set("x-tenant-origin", encodeTenantHeaderValue(origin))
    }
    // The footer's attribution line, resolved per shop by the backend
    // (`api/storefront/by-host/attribution.ts`). It rides the same header channel
    // as the rest of the tenant's identity rather than costing the footer its own
    // fetch on every page.
    if (tenant.attribution) {
      headers.set(
        "x-tenant-attribution",
        encodeTenantHeaderValue(JSON.stringify(tenant.attribution))
      )
    }
  }

  return headers
}

export async function middleware(request: NextRequest) {
  // A demo host answers before any tenant lookup: it has no tenant by design,
  // and resolveTenantByHost would be one pointless backend round trip per
  // request on a host whose whole purpose is to need nothing from the shop.
  if (isDemoHost(request.headers.get("host"))) {
    return demoHostResponse(request)
  }

  // Which shop, before anything else: the key every downstream fetch needs and
  // the theme the layout paints both come from here (piece 9). A host with no
  // tenant answers null and the storefront stays in single-store mode.
  const tenant = await resolveTenantByHost(
    BACKEND_URL,
    request.headers.get("host")
  )
  // Before anything else this shop's pages would do: an address that is not the
  // shop's main one answers a permanent redirect to the same page of the one
  // that is, assets included.
  const redirectToPrimary = primaryHostRedirect(request, tenant)

  if (redirectToPrimary) {
    return redirectToPrimary
  }

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

  const segments = request.nextUrl.pathname.split("/").filter(Boolean)
  const firstSegment = segments[0]
  const hasLocaleInUrl = firstSegment && isAppLocale(firstSegment)

  // Only an explicit pick in the language switcher (the choice cookie) outranks
  // the browser; _medusa_locale is the locale of whatever page was served last,
  // and reading it here pinned every visitor to the first prefixed link they ever
  // followed (t-2026-09-10-01).
  const chosenLocale = request.cookies.get(LOCALE_CHOICE_COOKIE)?.value

  const entryLocale =
    chosenLocale && isAppLocale(chosenLocale)
      ? chosenLocale
      : LOCALE_PINNED
        ? defaultLocale
        : (matchBrowserLocale(request.headers.get("accept-language")) ??
          defaultLocale)

  // The locale of THIS request, whether it came from the URL or was just
  // negotiated. The country is resolved from it, so it has to be known first.
  const locale = hasLocaleInUrl ? (firstSegment as string) : entryLocale

  // Region detection is owned by @lib/geolocation. It reads the visitor's
  // country from the _medusa_country cookie, or the locale map, or resolves it
  // through the configured geolocation provider, and returns the country plus a
  // function that writes the cookie (and the x-geo-* debug headers) onto the
  // response we return below.
  const { countryCode, apply: applyCountry } = await resolveCountry(
    request,
    regionMap,
    locale
  )

  // Server components read this instead of waiting for the cookie to come back on
  // the next request, so the first page a visitor sees is already priced in the
  // currency of their region (@lib/data/cookies `getCountryCode`).
  requestHeaders.set(COUNTRY_HEADER, countryCode)

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

  // No locale in URL — redirect 302 to the one negotiated above.
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
