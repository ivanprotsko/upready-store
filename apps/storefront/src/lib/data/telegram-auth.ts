"use server"

import { sdk } from "@lib/config"
import { defaultLocale } from "@i18n/config"
import { revalidateTag } from "next/cache"
import { redirect } from "next/navigation"
import { sanitizeAccountReturnPath } from "@lib/util/return-path"
import { syntheticTelegramEmail } from "@lib/util/telegram-contact"
import { decodeJwtPayload } from "@lib/util/yandex-auth"
import { getAuthHeaders, getCacheTag, setAuthToken } from "./cookies"
import { retrieveCustomer, transferCart } from "./customer"
import { getLocale } from "./locale-actions"
import { mergeWishlistItems } from "./wishlist"
import { PRODUCT_ID } from "@lib/util/wishlist-storage"

/** What the Telegram Login Widget hands its `data-onauth` callback. */
export type TelegramWidgetUser = {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

export type TelegramSignInError = "unconfigured" | "rejected" | "expired" | "failed"

export type TelegramLinkError = "taken" | "rejected" | "failed"

type TelegramTokenMetadata = {
  telegram_id?: number
  telegram_username?: string | null
  telegram_first_name?: string | null
  telegram_last_name?: string | null
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** The widget's own fields, as the strings the backend signs over; nothing else. */
const widgetFields = (user: TelegramWidgetUser): Record<string, string> =>
  Object.fromEntries(
    Object.entries(user)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)])
  )

/**
 * Verifies the signed Telegram payload on the backend (`/auth/customer/telegram`,
 * the shop's own bot token), creates the customer on a first sign-in, and
 * starts the session exactly as the e-mail `login` does.
 */
async function startTelegramSession(
  body: Record<string, string>
): Promise<TelegramSignInError | null> {
  let token: string
  try {
    const res = await sdk.client.fetch<{ token?: string }>(`/auth/customer/telegram`, {
      method: "POST",
      body,
    })
    if (!res.token) {
      return "failed"
    }
    token = res.token
  } catch (error) {
    const message = errorMessage(error)
    console.error("[telegram-auth] sign-in refused:", message)
    if (/not configured/i.test(message)) return "unconfigured"
    if (/expired/i.test(message)) return "expired"
    if (/verified|unexpected/i.test(message)) return "rejected"
    return "failed"
  }

  const payload = decodeJwtPayload(token)
  if (!payload?.actor_id) {
    const telegram = (payload?.user_metadata ?? {}) as TelegramTokenMetadata
    if (typeof telegram.telegram_id !== "number") {
      console.error("[telegram-auth] token carries no telegram_id")
      return "failed"
    }

    const bearer = { authorization: `Bearer ${token}` }
    try {
      await sdk.store.customer.create(
        {
          email: syntheticTelegramEmail(telegram.telegram_id),
          first_name: telegram.telegram_first_name ?? "",
          last_name: telegram.telegram_last_name ?? "",
          metadata: {
            locale: (await getLocale()) ?? defaultLocale,
            telegram_id: telegram.telegram_id,
            telegram_username: telegram.telegram_username ?? null,
          },
        },
        {},
        bearer
      )
      // The first token predates the customer, so its actor_id is empty.
      const refreshed = await sdk.client.fetch<{ token: string }>(`/auth/token/refresh`, {
        method: "POST",
        headers: bearer,
      })
      token = refreshed.token
    } catch (error) {
      console.error("[telegram-auth] customer creation failed:", errorMessage(error))
      return "failed"
    }
  }

  await setAuthToken(token)
  revalidateTag(await getCacheTag("customers"))

  try {
    await transferCart()
  } catch (error) {
    // Not fatal: the buyer is signed in, the cart just stays anonymous.
    console.error("[telegram-auth] cart transfer failed:", errorMessage(error))
  }

  return null
}

/**
 * «Войти через Телеграм» (`modules/account/components/telegram-login`).
 * `wishlistProductIds` is the guest wishlist the button read from the
 * browser's `localStorage`, merged into the account the way `login()` in
 * `customer.ts` merges it; a failure there never fails the sign-in.
 */
export async function signInWithTelegramWidget(
  user: TelegramWidgetUser,
  returnTo: string | null,
  wishlistProductIds: string[] = []
): Promise<TelegramSignInError> {
  const error = await startTelegramSession(widgetFields(user))
  if (error) {
    return error
  }
  // A server action's arguments come from the browser: checked, not trusted.
  const productIds = (Array.isArray(wishlistProductIds) ? wishlistProductIds : []).filter(
    (value) => typeof value === "string" && PRODUCT_ID.test(value)
  )
  if (productIds.length) {
    try {
      await mergeWishlistItems(productIds)
    } catch (mergeError) {
      console.error("[telegram-auth] merging the guest wishlist failed:", errorMessage(mergeError))
    }
  }
  const locale = (await getLocale()) ?? defaultLocale
  // Outside any try/catch: `redirect()` throws NEXT_REDIRECT on purpose.
  redirect(sanitizeAccountReturnPath(returnTo, locale))
}

/**
 * The Mini App's silent sign-in from `Telegram.WebApp.initData`. `true` when a
 * session was started now, so the caller refreshes the server-rendered page.
 */
export async function signInWithTelegramMiniApp(initData: string): Promise<boolean> {
  if (!initData) {
    return false
  }
  if ("authorization" in (await getAuthHeaders()) && (await retrieveCustomer())) {
    return false
  }
  const error = await startTelegramSession({ initData })
  return error === null
}

/** «Привязать Telegram» for a buyer signed in by e-mail. */
export async function linkTelegramToAccount(
  user: TelegramWidgetUser
): Promise<TelegramLinkError | null> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) {
    return "failed"
  }
  try {
    await sdk.client.fetch(`/store/customers/me/telegram-link`, {
      method: "POST",
      headers,
      body: widgetFields(user),
    })
  } catch (error) {
    const message = errorMessage(error)
    console.error("[telegram-auth] link refused:", message)
    if (/already linked/i.test(message)) return "taken"
    if (/verified|not configured/i.test(message)) return "rejected"
    return "failed"
  }
  revalidateTag(await getCacheTag("customers"))
  return null
}
