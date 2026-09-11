import "server-only"
import { COUNTRY_CHOICE_COOKIE } from "@lib/geolocation"
import { cookies as nextCookies, headers as nextHeaders } from "next/headers"

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
    return headers.get("x-tenant-handle")
  } catch {
    return null
  }
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
