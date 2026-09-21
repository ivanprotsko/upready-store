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
import { originForHost, publicHost } from "@lib/tenant/origin"
import { resolveShopOfRequest } from "@lib/tenant/request-shop"
import { getTenantRedirects, resolveRedirect } from "@lib/tenant/redirects"
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
  tenant: ResolvedTenant | null,
  shopHost: string
): NextResponse | null {
  const primary = tenant?.primaryHost

  if (!primary) {
    return null
  }

  // The address that NAMED the shop, not the socket the request arrived on: on
  // the self-fetch Next makes for a Server Action redirect those differ, and
  // comparing the wrong one 301s that internal request off to the public
  // address mid-action (`lib/tenant/request-shop.ts`).
  const rawHost = shopHost.trim().toLowerCase()
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
  tenant: ResolvedTenant | null,
  shopHost: string
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
    // The language switcher's own list (t06-locale-currency): comma-separated
    // locale codes are plain ASCII, so `encodeTenantHeaderValue` never actually
    // has anything to escape here, but it goes through the same pair as every
    // other tenant value crossing this boundary rather than being a one-off
    // exception to the rule above.
    if (tenant.locale) {
      headers.set(
        "x-tenant-locales",
        encodeTenantHeaderValue(tenant.locale.enabledLocales.join(","))
      )
      headers.set(
        "x-tenant-default-locale",
        encodeTenantHeaderValue(tenant.locale.defaultLocale)
      )
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
      : originForHost(request.headers, request.nextUrl.protocol, shopHost)
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
    if (tenant.seoVerification) {
      headers.set(
        "x-tenant-seo-verification",
        encodeTenantHeaderValue(JSON.stringify(tenant.seoVerification))
      )
    }
    // t17-analytics step 1: this shop's own Yandex Metrica / GA4 ids, read by
    // `lib/data/analytics.ts` the same way the footer reads the attribution
    // line above. Absent entirely when the owner has set neither, which the
    // root layout reads as "load no analytics script for this tenant."
    if (tenant.analytics) {
      headers.set(
        "x-tenant-analytics",
        encodeTenantHeaderValue(JSON.stringify(tenant.analytics))
      )
    }
    // Logo, favicon, og image, primary colour, footer credit
    // (t16-owner-branding) — same channel, so the very first render already
    // has them with no extra round trip.
    headers.set(
      "x-tenant-branding",
      encodeTenantHeaderValue(JSON.stringify(tenant.branding))
    )
  }

  return headers
}

export async function middleware(request: NextRequest) {
  // A demo host answers before any tenant lookup: it has no tenant by design,
  // and resolveTenantByHost would be one pointless backend round trip per
  // request on a host whose whole purpose is to need nothing from the shop.
  // The address the VISITOR asked for decides this, not the socket the request
  // arrived on: the self-fetch below is addressed to the server's own origin,
  // and a deployment whose internal host happens to be listed here would send
  // every Server Action redirect to the funnel instead of to the shop.
  if (isDemoHost(publicHost(request.headers))) {
    return demoHostResponse(request)
  }

  // Which shop, before anything else: the key every downstream fetch needs and
  // the theme the layout paints both come from here (piece 9). A host with no
  // tenant answers null and the storefront stays in single-store mode.
  // `lib/tenant/request-shop.ts` owns the two-address rule: the `Host` header
  // first, the forwarded name only where `Host` names no shop — which is the
  // GET the Next server makes to ITSELF to render a Server Action's
  // `redirect()` target, the request that used to reach the buyer's
  // confirmation page with no tenant at all.
  const { tenant, host: shopHost } = await resolveShopOfRequest(
    request.headers,
    (host) => resolveTenantByHost(BACKEND_URL, host)
  )
  // Before anything else this shop's pages would do: an address that is not the
  // shop's main one answers a permanent redirect to the same page of the one
  // that is, assets included.
  const redirectToPrimary = primaryHostRedirect(request, tenant, shopHost)

  if (redirectToPrimary) {
    return redirectToPrimary
  }

  const publishableKey = tenant?.publishableKey ?? PUBLISHABLE_API_KEY ?? null
  const requestHeaders = tenantRequestHeaders(request, tenant, shopHost)
  const nextWithTenant = () =>
    NextResponse.next({ request: { headers: requestHeaders } })

  // The tenant's own redirect table (t11-seo-redirects), before the locale
  // logic below and before anything else this path would do: a page that
  // moved because a handle changed, or a row imported from a previous shop's
  // URL structure, both apply to the RAW incoming pathname, locale prefix and
  // all — `specs/tenant-address/CANONICAL.md` covers the host moving, this is
  // the path moving under one host.
  const pathRedirects = await getTenantRedirects(BACKEND_URL ?? "", publishableKey)
  const pathRedirect = resolveRedirect(request.nextUrl.pathname, pathRedirects)

  if (pathRedirect.kind === "loop") {
    return new NextResponse("Redirect loop detected", { status: 508 })
  }

  if (pathRedirect.kind === "redirect") {
    // No X-Robots-Tag here, unlike primaryHostRedirect below: this is the
    // shop's own content moving to a new URL of the SAME address, and a 301
    // is exactly how that weight is meant to carry over into the index.
    return NextResponse.redirect(
      new URL(`${pathRedirect.to}${request.nextUrl.search}`, request.url),
      pathRedirect.status
    )
  }

  // Root-level metadata routes with no extension in their URL (unlike
  // robots.txt/sitemap.xml/llms.txt, which the dot check above already
  // passes through): `opengraph-image`/`twitter-image` render at
  // `/opengraph-image` with the extension carried in `Content-Type`, not the
  // path (t16-owner-branding — broke the moment the static
  // `opengraph-image.png` file became a dynamic `.tsx` route, since a
  // scraper fetching the exact URL the metadata handed it was getting a
  // bogus `/en/opengraph-image` redirect, a 404).
  if (
    request.nextUrl.pathname.includes(".") ||
    request.nextUrl.pathname === "/opengraph-image" ||
    request.nextUrl.pathname === "/twitter-image"
  ) {
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

  // A shop's own `default_locale`/`enabled_locales` (t06-locale-currency) win
  // over the build's `defaultLocale`/`LOCALE_PIN`/`preferredLocales` once a host
  // resolves to a tenant that saved them: a visitor whose browser asks for a
  // language the shop never enabled gets the shop's OWN default rather than a
  // language it ships no content for. A choice-cookie pick from a DIFFERENT
  // tenant's switcher (or a stale cookie from before the shop narrowed its list)
  // is honoured only while it is still one of THIS shop's enabled locales.
  const tenantLocale = tenant?.locale

  const entryLocale = tenantLocale
    ? chosenLocale &&
      isAppLocale(chosenLocale) &&
      tenantLocale.enabledLocales.includes(chosenLocale)
      ? chosenLocale
      : (matchBrowserLocale(request.headers.get("accept-language"), {
          allowed: tenantLocale.enabledLocales,
          preferred: [tenantLocale.defaultLocale],
        }) ?? (tenantLocale.defaultLocale as typeof defaultLocale))
    : chosenLocale && isAppLocale(chosenLocale)
      ? chosenLocale
      : LOCALE_PINNED
        ? defaultLocale
        : (matchBrowserLocale(request.headers.get("accept-language")) ??
          defaultLocale)

  // The tenant's own `default_locale → default_country` pairing overrides the
  // deployment-wide `LOCALE_COUNTRY_MAP` for that one locale: which currency a
  // shop's default language prices in is that shop's own pick, not the image's
  // (t06-locale-currency). Locales the tenant enabled beyond its default still
  // fall through to the deployment map (or to detection), same as today.
  const tenantLocaleCountryMap = tenantLocale?.defaultCountry
    ? new Map([[tenantLocale.defaultLocale, tenantLocale.defaultCountry]])
    : null

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
    locale,
    tenantLocaleCountryMap
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

  // A Server Action POST carries the URL of the page it was submitted from, so
  // the country and the locale derived above are the OLD ones. The actions set
  // their own cookies (`applyRegion`, `setLocaleCookie`), and writing the
  // URL-derived pair next to them put the visitor who switched country and
  // language together back on the pair they had just left.
  const isServerAction = request.headers.has("next-action")

  function withCookies(res: NextResponse, locale: string): NextResponse {
    if (isServerAction) {
      return res
    }
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
