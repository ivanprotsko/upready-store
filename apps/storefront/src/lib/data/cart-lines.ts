import "server-only"

import type {
  CartErrorCode,
  SyncLine,
  SyncReply,
} from "@lib/cart-store/queue"
import { sdk } from "@lib/config"
import { revalidateTag } from "next/cache"

import { dropShippingIfNothingToShip, getOrSetCart, retrieveCart } from "./cart"
import { getAuthHeaders, getCacheTag, getCartId } from "./cookies"

/**
 * Medusa refuses a quantity over the stock with a 400 whose message names the
 * inventory ("Some variant does not have the required inventory"); everything else is
 * a plain failure.
 */
const errorCode = (error: unknown): CartErrorCode =>
  /inventory|stock/i.test(String((error as { message?: unknown })?.message ?? ""))
    ? "stock"
    : "failed"

const revalidateCart = async () => {
  for (const tag of await Promise.all([getCacheTag("carts"), getCacheTag("fulfillment")])) {
    if (tag) {
      revalidateTag(tag)
    }
  }
}

/**
 * Sets each variant's line to an absolute quantity (0 removes it) and answers with the
 * cart afterwards: what the client queue (`lib/cart-store`) sends after its debounce.
 *
 * Absolute, not a delta: the line is looked up by variant on the server's own cart,
 * then created, updated or deleted to match, and a quantity that already matches is
 * left alone. Sending the same lines twice (a page unload re-sends what was pending)
 * therefore changes nothing the second time.
 *
 * Every line is tried even when one fails; the failures come back by variant, and the
 * cart in the reply is the truth the client falls back to. `at` is the server's clock
 * before that final read, the same clock `retrieveCartSnapshot` stamps a page's read
 * with, so the client can tell which of the two is newer.
 */
export async function syncCartLines(lines: SyncLine[]): Promise<SyncReply> {
  const headers = { ...(await getAuthHeaders()) }
  const wantsLines = lines.some((line) => line.quantity > 0)
  const cookieCartId = await getCartId()

  if (!cookieCartId && !wantsLines) {
    return { cart: null, at: Date.now(), errors: [] }
  }

  // A first add creates the cart and its cookie, and an existing cart moves into the
  // visitor's region, exactly as `addToCart` did. Removals alone need neither.
  const cartId = wantsLines ? (await getOrSetCart())?.id : cookieCartId
  if (!cartId) {
    throw new Error("Error retrieving or creating cart")
  }

  const current = await retrieveCart(cartId, "id,*items")
  const errors: SyncReply["errors"] = []
  let changed = false

  for (const { variantId, quantity } of lines) {
    const existing = current?.items?.find((item) => item.variant_id === variantId)
    try {
      if (!existing) {
        if (quantity > 0) {
          await sdk.store.cart.createLineItem(
            cartId,
            { variant_id: variantId, quantity },
            { fields: "id" },
            headers
          )
          changed = true
        }
      } else if (quantity === 0) {
        await sdk.store.cart.deleteLineItem(cartId, existing.id, { fields: "id" }, headers)
        changed = true
      } else if (existing.quantity !== quantity) {
        await sdk.store.cart.updateLineItem(
          cartId,
          existing.id,
          { quantity },
          { fields: "id" },
          headers
        )
        changed = true
      }
    } catch (error) {
      errors.push({ variantId, code: errorCode(error) })
    }
  }

  if (changed) {
    await revalidateCart()
  }

  let at = Date.now()
  let cart = await retrieveCart(cartId)

  // The last physical line went and the cart still carries its DHL method
  // (t-2026-10-04-23): the course left alone must not be charged shipping.
  if (changed && (await dropShippingIfNothingToShip(cart))) {
    at = Date.now()
    cart = await retrieveCart(cartId)
  }

  return { cart, at, errors }
}
