"use server"

import { LOCALE_CHOICE_COOKIE, LOCALE_COOKIE } from "@i18n/config"
import { sdk } from "@lib/config"
import { revalidateTag } from "next/cache"
import { cookies as nextCookies } from "next/headers"
import { getAuthHeaders, getCacheTag, getCartId } from "./cookies"

/**
 * Gets the current locale from cookies
 */
export const getLocale = async (): Promise<string | null> => {
  try {
    const cookies = await nextCookies()
    return cookies.get(LOCALE_COOKIE)?.value ?? null
  } catch {
    return null
  }
}

/**
 * Sets the locale cookie and, because this runs only for a pick made in the language
 * switcher, the choice cookie the middleware honours over Accept-Language.
 */
export const setLocaleCookie = async (locale: string) => {
  const cookies = await nextCookies()
  const options = {
    maxAge: 60 * 60 * 24 * 365, // 1 year
    httpOnly: false, // Allow client-side access
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
  }
  cookies.set(LOCALE_COOKIE, locale, options)
  cookies.set(LOCALE_CHOICE_COOKIE, locale, options)
}

/**
 * Updates the locale preference via SDK and stores in cookie.
 * Also updates the cart with the new locale if one exists.
 */
export const updateLocale = async (localeCode: string): Promise<string> => {
  await setLocaleCookie(localeCode)

  const authHeaders = await getAuthHeaders()

  // Update cart with the new locale if a cart exists
  const cartId = await getCartId()
  if (cartId) {
    const headers = {
      ...authHeaders,
    }

    await sdk.store.cart.update(cartId, { locale: localeCode }, {}, headers)

    const cartCacheTag = await getCacheTag("carts")
    if (cartCacheTag) {
      revalidateTag(cartCacheTag)
    }
  }

  // Persist the locale on the customer so transactional emails can use it
  if ("authorization" in authHeaders) {
    try {
      const { customer } = await sdk.store.customer.retrieve(
        {},
        { ...authHeaders }
      )

      await sdk.store.customer.update(
        { metadata: { ...(customer?.metadata ?? {}), locale: localeCode } },
        {},
        { ...authHeaders }
      )

      const customerCacheTag = await getCacheTag("customers")
      if (customerCacheTag) {
        revalidateTag(customerCacheTag)
      }
    } catch {}
  }

  // Revalidate relevant caches to refresh content
  const productsCacheTag = await getCacheTag("products")
  if (productsCacheTag) {
    revalidateTag(productsCacheTag)
  }

  const categoriesCacheTag = await getCacheTag("categories")
  if (categoriesCacheTag) {
    revalidateTag(categoriesCacheTag)
  }

  const collectionsCacheTag = await getCacheTag("collections")
  if (collectionsCacheTag) {
    revalidateTag(collectionsCacheTag)
  }

  return localeCode
}
