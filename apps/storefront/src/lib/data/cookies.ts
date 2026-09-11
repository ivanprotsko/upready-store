import "server-only"
import { COUNTRY_CHOICE_COOKIE } from "@lib/geolocation"
import { SITE_NAME, getBaseURL } from "@lib/util/env"
import { cookies as nextCookies, headers as nextHeaders } from "next/headers"
import { decodeTenantHeaderValue } from "@lib/tenant/headers"

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

export const getCountryCode = async (): Promise<string | null> => {
  try {
    const cookies = await nextCookies()
    return cookies.get("_medusa_country")?.value ?? null
  } catch {
    return null
  }
}

export const setCountryCode = async (countryCode: string) => {
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
  // This setter is reached only from updateRegion(), i.e. the visitor picked the
  // country. The marker tells middleware to keep it even when the deployment
  // pins a default region (@lib/geolocation, REGION_PIN).
  cookies.set(COUNTRY_CHOICE_COOKIE, "1", options)
}
