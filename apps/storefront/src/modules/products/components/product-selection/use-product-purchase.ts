"use client"

import { useCartQueue } from "@lib/cart-store"
import { draftLineFor } from "@lib/cart-store/draft"
import { useRouter } from "@i18n/navigation"
import type { HttpTypes } from "@medusajs/types"
import { useCartSidebar } from "@modules/layout/components/cart-sidebar/context"
import { useMemo } from "react"

import { useProductSelection } from "."

export type ProductPurchase = {
  /** The chosen variant as it is on the priced product (its price and stock). */
  selectedVariant: HttpTypes.StoreProductVariant | undefined
  inStock: boolean
  isValidVariant: boolean
  /** True while «Купить» waits for the cart to reach the server, wherever it was pressed. */
  isAdding: boolean
  canBuy: boolean
  /** «В корзину»: one more of the chosen variant in the cart, shown at once. */
  handleAddToCart: () => void
  /** «Купить»: the same, then straight to the checkout's first step once the server has it. */
  handleBuyNow: () => Promise<void>
}

/** Whether a variant can go into the cart: stock is not tracked, back orders are allowed, or some is left. */
export const variantInStock = (
  variant: HttpTypes.StoreProductVariant | undefined
): boolean => {
  if (!variant) {
    return false
  }
  if (!variant.manage_inventory || variant.allow_backorder) {
    return true
  }
  return (variant.inventory_quantity || 0) > 0
}

/**
 * The one implementation of buying on the product page, shared by the buy box, the
 * phone's sticky bar and the «Характеристики и описание» drawer, so the three buttons
 * put the same line in the cart and are disabled in the same states.
 *
 * `product` is the one with the region's prices; the choice itself comes from
 * `ProductSelectionProvider`.
 *
 * Adding goes through the client cart queue (t-2026-10-03-66): the count, the
 * «В КОРЗИНЕ − N +» pill and the sidebar change on the click itself, and the request
 * follows in the background, so nothing on the page waits or disables itself.
 * «Купить» is the one exception: it leaves for the checkout, so it waits until the queue
 * has reached the server, and the provider's `busy` disables the buy box, the drawer and
 * the variant pickers for that wait.
 */
export function useProductPurchase(
  product: HttpTypes.StoreProduct | undefined,
  disabled?: boolean
): ProductPurchase {
  const router = useRouter()
  const queue = useCartQueue()
  const { open: openCartSidebar } = useCartSidebar()
  const {
    selectedVariant: chosen,
    isValidVariant,
    busy,
    setBusy,
  } = useProductSelection()

  const selectedVariant = useMemo(
    () =>
      chosen
        ? product?.variants?.find((variant) => variant.id === chosen.id)
        : undefined,
    [product?.variants, chosen]
  )

  const inStock = variantInStock(selectedVariant)

  const canBuy =
    Boolean(selectedVariant) && inStock && isValidVariant && !disabled && !busy

  const add = (): boolean => {
    if (!product || !selectedVariant?.id) return false
    queue.add(selectedVariant.id, 1, draftLineFor(product, selectedVariant))
    return true
  }

  const handleAddToCart = () => {
    if (add()) {
      // Batch 5: on a desktop viewport «В корзину» opens the cart sidebar (a no-op below
      // 1024 px, where the cart stays the page), now on the click, with the line in it.
      openCartSidebar()
    }
  }

  const handleBuyNow = async () => {
    if (!add()) return
    setBusy(true)
    try {
      const { ok } = await queue.settle()
      // The cart page is skipped on purpose; it is one click away from the checkout
      // anyway. A refused line stays here, back at the server's quantity, saying why.
      if (ok) router.push("/checkout?step=address")
    } finally {
      setBusy(false)
    }
  }

  return {
    selectedVariant,
    inStock,
    isValidVariant,
    isAdding: busy,
    canBuy,
    handleAddToCart,
    handleBuyNow,
  }
}
