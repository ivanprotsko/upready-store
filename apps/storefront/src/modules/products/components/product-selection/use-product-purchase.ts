"use client"

import { useCartQueue } from "@lib/cart-store"
import { draftLineFor } from "@lib/cart-store/draft"
import type { HttpTypes } from "@medusajs/types"
import { useCartSidebar } from "@modules/layout/components/cart-sidebar/context"
import { useMemo } from "react"

import { useProductSelection } from "."

export type ProductPurchase = {
  /** The chosen variant as it is on the priced product (its price and stock). */
  selectedVariant: HttpTypes.StoreProductVariant | undefined
  inStock: boolean
  isValidVariant: boolean
  canBuy: boolean
  /**
   * The `ProductActions` key the add button reads: «Выбрать вариант» while the choice is
   * incomplete, «Нет в наличии» without stock, else «В корзину». The same words wherever
   * the button stands, so a disabled one says why.
   */
  addLabel: "selectVariant" | "outOfStock" | "addToCart"
  /** «В корзину»: one more of the chosen variant in the cart, shown at once. */
  handleAddToCart: () => void
}

type ProductPurchaseOptions = {
  /**
   * Runs once the line is in the client cart, before the cart sidebar opens: the details
   * drawer closes itself here, so the sidebar, the header's count and «В корзине − N +»
   * are what the buyer sees next, not the drawer that covered them.
   */
  onAdded?: () => void
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
 *
 * There is no «Купить» that leaves for the checkout any more (Ivan, 12.10.2026: «убери
 * кнопку "купить" везде», t-2026-10-12-06): «В корзину» is the one way to buy here.
 */
export function useProductPurchase(
  product: HttpTypes.StoreProduct | undefined,
  disabled?: boolean,
  { onAdded }: ProductPurchaseOptions = {}
): ProductPurchase {
  const queue = useCartQueue()
  const { open: openCartSidebar } = useCartSidebar()
  const { selectedVariant: chosen, isValidVariant } = useProductSelection()

  const selectedVariant = useMemo(
    () =>
      chosen
        ? product?.variants?.find((variant) => variant.id === chosen.id)
        : undefined,
    [product?.variants, chosen]
  )

  const inStock = variantInStock(selectedVariant)

  const canBuy =
    Boolean(selectedVariant) && inStock && isValidVariant && !disabled

  // A product still without its prices (the drawer before the buy box has published one)
  // is not out of stock, only not ready: the button stays disabled with its usual word.
  const addLabel = !isValidVariant
    ? "selectVariant"
    : product && !inStock
    ? "outOfStock"
    : "addToCart"

  const handleAddToCart = () => {
    if (!product || !selectedVariant?.id) return
    queue.add(selectedVariant.id, 1, draftLineFor(product, selectedVariant))
    onAdded?.()
    // Batch 5: on a desktop viewport «В корзину» opens the cart sidebar (a no-op below
    // 1024 px, where the cart stays the page), now on the click, with the line in it.
    openCartSidebar()
  }

  return {
    selectedVariant,
    inStock,
    isValidVariant,
    canBuy,
    addLabel,
    handleAddToCart,
  }
}
