import "server-only"
import { COUNTRY_CHOICE_COOKIE, COUNTRY_HEADER } from "@lib/geolocation"
import { SITE_NAME, getBaseURL } from "@lib/util/env"
import { cookies as nextCookies, headers as nextHeaders } from "next/headers"
import { decodeTenantHeaderValue } from "@lib/tenant/headers"
import { appLocales, type Locale } from "@i18n/config"

export const getAuthHeaders = async (): Promise<
  { authorization: string } | Record<string, never>
> => {
  try {
    const cookies = await nextCookies()
    const token = cookies.get("_medusa_jwt")?.value

    if (!token) {
      return {}
    }

    return { authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}

export const getCacheTag = async (tag: string): Promise<string> => {
  try {
    const cookies = await nextCookies()
    const cacheId = cookies.get("_medusa_cache_id")?.value

    if (!cacheId) {
      return ""
    }

    return `${tag}-${cacheId}`
  } catch {
    return ""
  }
}

/**
 * The shop this request belongs to, as `src/middleware.ts` resolved it from the
 * Host header (piece 9, docs/multitenancy/storefront-by-host.md §2). Null in
 * single-store mode and outside a request.
 *
 * SWEEP_OK — this never throws and its absence is never an error, so no caller
 * needs a guard of its own. It is a request header this same process wrote a
 * moment ago, not a client-held id pointing at foreign state that may be gone:
 * the two dereferences that exist (`getCacheOptions` below, `getTenantHome` in
 * `tenant-home.ts`) both branch on null and carry on with the unscoped tag.
 */
export const getTenantHandle = async (): Promise<string | null> => {
  try {
    const headers = await nextHeaders()
    return decodeTenantHeaderValue(headers.get("x-tenant-handle"))
  } catch {
    return null
  }
}

/**
 * The store name to render — the tenant's own (`tenant.name`, resolved by
 * `src/middleware.ts` from the Host and put on `x-tenant-name`), or the build
 * constant `SITE_NAME` for a host with no tenant (single-store fallback, piece
 * 9's documented 404 branch — `docs/multitenancy/storefront-by-host.md` §2).
 *
 * Lives here, not in `@lib/util/env`, and behind `import "server-only"` at the
 * top of this file on purpose: `next/headers` throws when it reaches a client
 * bundle, so a client component that tried to import this accessor directly
 * would fail the build rather than the browser (rule 19g — a `"use client"`
 * directive colours the whole import graph below it). A client component gets
 * the name as a PROP from a server parent instead.
 */
export const getSiteName = async (): Promise<string> => {
  try {
    const headers = await nextHeaders()
    const tenantName = decodeTenantHeaderValue(headers.get("x-tenant-name"))

    if (tenantName) {
      return tenantName
    }
  } catch {}

  return SITE_NAME
}

/**
 * The locales THIS shop's switcher may offer (`x-tenant-locales`,
 * `src/middleware.ts`, t06-locale-currency), or null for a host with no tenant
 * or a tenant that never saved `tenant_locale_settings` — the switcher then
 * falls back to every locale the storefront ships (single-store behaviour,
 * unchanged).
 */
export const getEnabledLocales = async (): Promise<string[] | null> => {
  try {
    const headers = await nextHeaders()
    const raw = decodeTenantHeaderValue(headers.get("x-tenant-locales"))

    if (!raw) {
      return null
    }

    const codes = raw.split(",").filter(Boolean)

    return codes.length ? codes : null
  } catch {
    return null
  }
}

/**
 * The language switcher's own list: `appLocales` narrowed to `getEnabledLocales()`
 * when a tenant resolved one, else every locale the storefront ships — the
 * single-store fallback (t06-locale-currency). Every `nav/variants/h*.tsx` reads
 * this instead of `appLocales` directly, so a shop that has not enabled a
 * language never offers it in the switcher.
 */
/**
 * The locale the owner edits shop-wide SEO fields in (`x-tenant-default-locale`,
 * `src/middleware.ts`, t11-seo-redirects step 2): a tenant's own `default_locale`
 * from `tenant_locale_settings` when it saved one, else `"en"` — the same
 * fallback `apps/tenant-panel/src/lib/seo-metadata.ts` writes under when no
 * locale settings exist yet.
 */
export const getTenantDefaultLocale = async (): Promise<string> => {
  try {
    const headers = await nextHeaders()
    const raw = decodeTenantHeaderValue(headers.get("x-tenant-default-locale"))
    return raw || "en"
  } catch {
    return "en"
  }
}

export const getSwitcherLocales = async (): Promise<Locale[]> => {
  const enabled = await getEnabledLocales()

  if (!enabled) {
    return appLocales
  }

  return appLocales.filter((locale) => enabled.includes(locale.code))
}

/**
 * The origin this request arrived on, put on `x-tenant-origin` by `src/middleware.ts`
 * for a host that resolves to a shop (`lib/tenant/origin.ts`). Null on a single-store
 * deployment, where no tenant is resolved.
 */
export const getTenantOrigin = async (): Promise<string | null> => {
  try {
    const headers = await nextHeaders()
    return decodeTenantHeaderValue(headers.get("x-tenant-origin"))
  } catch {
    return null
  }
}

/**
 * The base every absolute URL a page emits is built on: canonical and hreflang,
 * JSON-LD, sitemap, robots, llms.txt and Open Graph. A shop served by Host answers
 * on its own origin; a single-store deployment keeps `NEXT_PUBLIC_BASE_URL`. Never
 * a trailing slash.
 */
export const getRequestBaseURL = async (): Promise<string> => {
  const origin = await getTenantOrigin()
  return (origin ?? getBaseURL()).replace(/\/$/, "")
}

export const getCacheOptions = async (
  tag: string
): Promise<{ tags: string[] } | Record<string, never>> => {
  if (typeof window !== "undefined") {
    return {}
  }

  const [cacheTag, handle] = await Promise.all([
    getCacheTag(tag),
    getTenantHandle(),
  ])

  if (!cacheTag) {
    return {}
  }

  // One process serves every shop, so a bare `products` tag would make one
  // shop's revalidation throw away every other shop's cached catalog. The
  // handle scopes the tag to its owner; a single-store deployment resolves no
  // handle and keeps exactly today's tag.
  return { tags: [handle ? `${cacheTag}-${handle}` : `${cacheTag}`] }
}

export const setAuthToken = async (token: string) => {
  const cookies = await nextCookies()
  cookies.set("_medusa_jwt", token, {
    maxAge: 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
}

export const removeAuthToken = async () => {
  const cookies = await nextCookies()
  cookies.set("_medusa_jwt", "", {
    maxAge: -1,
  })
}

export const getCartId = async () => {
  const cookies = await nextCookies()
  return cookies.get("_medusa_cart_id")?.value
}

export const setCartId = async (cartId: string) => {
  const cookies = await nextCookies()
  cookies.set("_medusa_cart_id", cartId, {
    maxAge: 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
}

export const removeCartId = async () => {
  const cookies = await nextCookies()
  cookies.set("_medusa_cart_id", "", {
    maxAge: -1,
  })
}

export const getPromoBannerDismissed = async (): Promise<boolean> => {
  try {
    const cookies = await nextCookies()
    return cookies.get("_promo_banner_dismissed")?.value === "1"
  } catch {
    return false
  }
}

/**
 * The country this request is priced in. The middleware resolves it and writes it
 * BOTH as a request header (this request) and as a response cookie (the next
 * ones); the header wins, because the cookie a visitor sends is the one from
 * their previous visit and on the first one there is none at all — which is how a
 * page could paint prices in the wrong currency before settling.
 *
 * A visitor cannot forge the header: `tenantRequestHeaders` in `src/middleware.ts`
 * deletes it from the incoming request before writing ours.
 */
export const getCountryCode = async (): Promise<string | null> => {
  try {
    const headers = await nextHeaders()
    const fromMiddleware = headers.get(COUNTRY_HEADER)

    if (fromMiddleware) {
      return fromMiddleware
    }
  } catch {}

  try {
    const cookies = await nextCookies()
    return cookies.get("_medusa_country")?.value ?? null
  } catch {
    return null
  }
}

/**
 * `explicit` is the difference between the visitor PICKING a country and the
 * storefront DERIVING one for them. Only a pick writes `COUNTRY_CHOICE_COOKIE`,
 * the marker that outranks the locale map, the pinned default region and
 * detection alike (@lib/geolocation). Switching the language moves the region
 * too, but it must not impersonate a country the visitor never chose — otherwise
 * one language pick would overwrite "ship it to Germany" for a year.
 */
export const setCountryCode = async (
  countryCode: string,
  { explicit = true }: { explicit?: boolean } = {}
) => {
  const cookies = await nextCookies()
  const options = {
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: false,
    // "lax" so the cookie is still sent on top-level navigations coming from
    // another site (payment provider redirects) — see middleware.ts.
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  }
  cookies.set("_medusa_country", countryCode, options)

  if (explicit) {
    cookies.set(COUNTRY_CHOICE_COOKIE, "1", options)
  }
}
