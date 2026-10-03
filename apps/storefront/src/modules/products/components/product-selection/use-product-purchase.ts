"use client"

import { addToCart } from "@lib/data/cart"
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
  /** True while a cart request runs, wherever it was started. */
  isAdding: boolean
  canBuy: boolean
  /** «В корзину»: one of the chosen variant into the cart. */
  handleAddToCart: () => Promise<null | undefined>
  /** «Купить»: the same line in the cart, then straight to the checkout's first step. */
  handleBuyNow: () => Promise<null | undefined>
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
 * `ProductSelectionProvider`. The "adding" state is the provider's `busy`, so a request
 * started in the drawer disables the buy box too, and the variant pickers with them.
 */
export function useProductPurchase(
  product: HttpTypes.StoreProduct | undefined,
  disabled?: boolean
): ProductPurchase {
  const router = useRouter()
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

  const add = async (thenCheckout: boolean) => {
    if (!selectedVariant?.id) return null

    setBusy(true)
    try {
      await addToCart({
        variantId: selectedVariant.id,
        quantity: 1,
      })
      if (thenCheckout) {
        // The cart page is skipped on purpose; it is one click away from the checkout anyway.
        router.push("/checkout?step=address")
      } else {
        // Batch 5: on a desktop viewport a successful «В корзину» opens the cart sidebar
        // (a no-op below 1024 px, where the cart stays the page).
        openCartSidebar()
      }
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
    handleAddToCart: () => add(false),
    handleBuyNow: () => add(true),
  }
}
