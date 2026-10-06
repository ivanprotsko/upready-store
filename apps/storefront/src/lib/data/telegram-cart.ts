"use server"

import { sdk } from "@lib/config"
import { linesToCarry, type CartLine } from "@lib/telegram/bot-cart"
import type { MiniAppEntryResult } from "@lib/telegram/mini-app-entry"
import { upstreamStatus } from "@lib/util/upstream-retry"
import { revalidateTag } from "next/cache"
import { getAuthHeaders, getCacheTag, getCartId, setCartId } from "./cookies"
import { signInWithTelegramMiniApp } from "./telegram-auth"

type AuthHeaders = Awaited<ReturnType<typeof getAuthHeaders>>

const LINE_FIELDS = "id,completed_at,items.variant_id,items.quantity,items.metadata"

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * The lines of an open cart. Null when the backend no longer has the cart or
 * the cart is already an order, so there is nothing to carry. Any other failure
 * throws, because a cart that could not be read may still hold lines.
 */
async function readOpenLines(cartId: string, headers: AuthHeaders): Promise<CartLine[] | null> {
  try {
    const { cart } = await sdk.client.fetch<{
      cart: { completed_at?: string | null; items?: CartLine[] | null }
    }>(`/store/carts/${cartId}`, {
      method: "GET",
      query: { fields: LINE_FIELDS },
      headers,
      cache: "no-store",
    })
    return cart.completed_at ? null : (cart.items ?? [])
  } catch (error) {
    if (upstreamStatus(error) === 404) {
      return null
    }
    throw error
  }
}

/**
 * Adds the site cart's lines to the bot's cart before the cookie moves on
 * (`lib/telegram/bot-cart.ts` has the rule). A line the backend refuses by name
 * with a 4xx answer (the variant is gone or out of stock) is logged and left
 * behind, since it could not be bought from either cart. Any other failure
 * throws, so the switch does not happen and the next page load tries again.
 */
async function carrySiteLines(siteCartId: string, botCartId: string, headers: AuthHeaders) {
  const siteLines = await readOpenLines(siteCartId, headers)
  if (!siteLines?.length) {
    return
  }
  const botLines = await readOpenLines(botCartId, headers)
  if (!botLines) {
    throw new Error(`the bot's cart ${botCartId} could not be read`)
  }

  for (const line of linesToCarry(siteLines, botLines)) {
    try {
      await sdk.store.cart.createLineItem(botCartId, line, {}, headers)
    } catch (error) {
      const status = upstreamStatus(error)
      if (status === null || status < 400 || status >= 500) {
        throw error
      }
      console.error(
        `[telegram-cart] line ${line.variant_id} of cart ${siteCartId} was not carried into ${botCartId}:`,
        errorMessage(error)
      )
    }
  }
}

/**
 * Switches this visitor's cart cookie to the cart they filled in the chat with
 * the shop's bot. The backend decides which cart that is from `initData` alone
 * (`POST /store/telegram-bot/cart`). No cart id is sent, and a refusal leaves
 * the cookie as it was. `true` when the cookie changed.
 */
async function adoptBotCart(initData: string): Promise<boolean> {
  const headers = await getAuthHeaders()

  let botCartId: string | null
  try {
    const answer = await sdk.client.fetch<{ cart_id?: string | null }>(
      `/store/telegram-bot/cart`,
      { method: "POST", headers, body: { initData }, cache: "no-store" }
    )
    botCartId = answer.cart_id || null
  } catch (error) {
    console.error("[telegram-cart] the bot's cart was not opened:", errorMessage(error))
    return false
  }

  const siteCartId = await getCartId()
  if (!botCartId || botCartId === siteCartId) {
    return false
  }

  if (siteCartId) {
    try {
      await carrySiteLines(siteCartId, botCartId, headers)
    } catch (error) {
      console.error(
        "[telegram-cart] the site cart's lines were not carried, the cart stays:",
        errorMessage(error)
      )
      return false
    }
  }

  await setCartId(botCartId)
  revalidateTag(await getCacheTag("carts"))
  return true
}

/**
 * What a page does once when it opens inside the shop's Mini App
 * (`modules/telegram/components/mini-app-bridge`). It opens the bot's cart,
 * then signs the buyer in when the bridge asks for it.
 *
 * The cart comes first on purpose. The sign-in hands the cookie cart over to
 * the customer (`transferCart`), which would make an anonymous site cart the
 * customer's newest one, and the newest one is what "the bot's cart" means.
 *
 * A server action's arguments come from the browser. `initData` is checked on
 * the backend with the shop's own bot token, and here it is only passed on. A
 * call without it, which is every call made outside Telegram, changes nothing.
 */
export async function enterMiniApp(initData: string, signIn: boolean): Promise<MiniAppEntryResult> {
  if (typeof initData !== "string" || !initData) {
    return { signedIn: false, cartAdopted: false }
  }

  const cartAdopted = await adoptBotCart(initData)

  let signedIn = false
  if (signIn === true) {
    try {
      signedIn = await signInWithTelegramMiniApp(initData)
    } catch (error) {
      console.error("[telegram-cart] silent sign-in failed:", errorMessage(error))
    }
  }

  return { signedIn, cartAdopted }
}
