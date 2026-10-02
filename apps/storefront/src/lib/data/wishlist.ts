"use server"

import { revalidateTag } from "next/cache"

import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { getAuthHeaders, getCacheOptions, getCacheTag } from "./cookies"

export type WishlistProductSummary = {
  id: string
  title: string
  handle: string | null
  thumbnail: string | null
  variant_ids: string[]
}

export type WishlistItem = {
  product_id: string
  created_at: string
  /** Null when the product was saved, then removed from the shop. */
  product: WishlistProductSummary | null
}

/** Whether THIS request carries a customer token — the heart button's only use of it is deciding between the account's own list and the browser's localStorage. */
export const isWishlistCustomerLoggedIn = async (): Promise<boolean> => {
  const authHeaders = await getAuthHeaders()
  return Object.keys(authHeaders).length > 0
}

const EMPTY_ITEMS: WishlistItem[] = []

/**
 * Every item the signed-in customer saved on THIS shop. Empty — never a
 * throw — for a guest: the heart button then falls back to the browser's
 * own localStorage (`wishlist-storage.ts`).
 *
 * `cache: "force-cache"` plus the shop-scoped tag (`getCacheOptions`) is what
 * lets `ProductCard` and `ProductInfo` each call this once per instance on a
 * listing page without turning into one request per card: Next's fetch
 * request memoization collapses identical calls within the same render
 * (the same pattern `getEffectiveSettings()` relies on, `nav/index.tsx`).
 */
export const listWishlistItems = async (): Promise<WishlistItem[]> => {
  const authHeaders = await getAuthHeaders()
  if (!Object.keys(authHeaders).length) {
    return EMPTY_ITEMS
  }

  const next = { ...(await getCacheOptions("wishlist")) }

  return await sdk.client
    .fetch<{ items: WishlistItem[] }>(`/store/wishlist`, {
      method: "GET",
      headers: authHeaders,
      next,
      cache: "force-cache",
    })
    .then(({ items }) => items)
    .catch(() => EMPTY_ITEMS)
}

export const getWishlistProductIds = async (): Promise<string[]> => {
  const items = await listWishlistItems()
  return items.map((item) => item.product_id)
}

async function revalidateWishlist() {
  const tag = await getCacheTag("wishlist")
  revalidateTag(tag)
}

export const addWishlistItem = async (productId: string): Promise<void> => {
  const headers = { ...(await getAuthHeaders()) }

  await sdk.client
    .fetch(`/store/wishlist`, {
      method: "POST",
      headers,
      body: { product_id: productId },
    })
    .then(revalidateWishlist)
    .catch(medusaError)
}

export const removeWishlistItem = async (productId: string): Promise<void> => {
  const headers = { ...(await getAuthHeaders()) }

  await sdk.client
    .fetch(`/store/wishlist/${encodeURIComponent(productId)}`, {
      method: "DELETE",
      headers,
    })
    .then(revalidateWishlist)
    .catch(medusaError)
}

/**
 * Guest → account merge at sign-in (f03-style): every id the browser kept in
 * localStorage is POSTed once. The route's own idempotent insert means an id
 * already in the account is a no-op, not a duplicate, and one failure is
 * logged rather than stopping the rest (rule 20a) — a half-merged wishlist is
 * still better than none.
 */
export const mergeWishlistItems = async (productIds: string[]): Promise<void> => {
  if (!productIds.length) {
    return
  }

  const results = await Promise.allSettled(productIds.map((id) => addWishlistItem(id)))
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[mergeWishlistItems] could not merge a saved product:", result.reason)
    }
  }
}
