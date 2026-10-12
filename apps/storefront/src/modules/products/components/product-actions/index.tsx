"use client"

import { useCart, type CartSnapshot } from "@lib/cart-store"
import { draftLineFor } from "@lib/cart-store/draft"
import { quantityIn } from "@lib/cart-store/queue"
import type { HttpTypes } from "@medusajs/types"
import { Button } from "@medusajs/ui"
import CartLineError from "@modules/cart/components/cart-line-error"
import { useProductSelection } from "@modules/products/components/product-selection"
import { useProductPurchase } from "@modules/products/components/product-selection/use-product-purchase"
import InCartStepper from "@modules/products/components/in-cart-stepper"
import { maxQuantity } from "@modules/products/components/in-cart-stepper/logic"
import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import ProductPrice from "../product-price"
import MobileActions from "./mobile-actions"

type ProductActionsProps = {
  /** The product WITH prices for the region (`ProductActionsWrapper` fetches it). */
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  disabled?: boolean
  /**
   * The cart as the server read it (the Olavka shop, Ivan's remark 24): with it a variant
   * in the cart shows «В КОРЗИНЕ − N +» in place of «В корзину», the quantity kept by the
   * client cart queue from then on (t-2026-10-03-66). Absent: today's button.
   */
  cartSnapshot?: CartSnapshot
}

/**
 * The buy box: the right-hand card of the product page. Price, availability, «В корзину»
 * on the card's whole width, and the phone's sticky bar. No «Купить» next to it (Ivan,
 * 12.10.2026: «убери кнопку "купить" везде», t-2026-10-12-06).
 *
 * Which variant is meant comes from `ProductSelectionProvider`: the pickers live in the
 * centre card, this card only spends the choice. The provider knows the variant by id
 * from the page's own product; the price and the stock are read off THIS component's
 * product, the one fetched with the region's prices.
 */
export default function ProductActions({
  product,
  disabled,
  cartSnapshot,
}: ProductActionsProps) {
  const t = useTranslations("ProductActions")
  const { options, setOptionValue, detailsOpen, setPricedProduct } =
    useProductSelection()
  const {
    selectedVariant,
    inStock,
    isValidVariant,
    canBuy,
    addLabel,
    handleAddToCart,
  } = useProductPurchase(product, disabled)
  const { cart, queue } = useCart(cartSnapshot)

  // The details drawer sells from the same priced product; the Suspense fallback (no
  // prices, disabled) does not publish, so the drawer never shows a price-less footer.
  useEffect(() => {
    if (disabled) {
      return
    }
    setPricedProduct(product)
    return () => setPricedProduct(undefined)
  }, [product, disabled, setPricedProduct])

  const actionsRef = useRef<HTMLDivElement>(null)

  // The phone's sticky buy bar appears once the buy box has been scrolled PAST, not merely
  // while it is off screen: on first paint the box is still below the fold (the gallery
  // fills the first screen), and a bar shown then sat on top of the title and the price.
  const [scrolledPast, setScrolledPast] = useState(false)
  useEffect(() => {
    const box = actionsRef.current
    if (!box || typeof IntersectionObserver === "undefined") {
      return
    }
    const observer = new IntersectionObserver(([entry]) =>
      setScrolledPast(
        !entry.isIntersecting && entry.boundingClientRect.bottom <= 0
      )
    )
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  // The phone's sticky buy bar steps aside at the end of the page: over the footer it
  // would cover the seller's contacts, which is content too.
  const [footerInView, setFooterInView] = useState(false)
  useEffect(() => {
    const footer = document.querySelector("footer")
    if (!footer || typeof IntersectionObserver === "undefined") {
      return
    }
    const observer = new IntersectionObserver(([entry]) =>
      setFooterInView(entry.isIntersecting)
    )
    observer.observe(footer)
    return () => observer.disconnect()
  }, [])

  // The variant's quantity in the cart and the way to change it; undefined when the shop
  // has no «В корзине» state.
  const inCart =
    cartSnapshot && selectedVariant && !disabled
      ? {
          quantity: quantityIn(cart, selectedVariant.id),
          // Batch 6, Q3.5: a course (`metadata.digital`) is bought once.
          max:
            (product.metadata as Record<string, unknown> | null | undefined)?.digital === "true"
              ? 1
              : maxQuantity(selectedVariant),
          onStep: (delta: 1 | -1) =>
            queue.add(selectedVariant.id, delta, draftLineFor(product, selectedVariant)),
        }
      : undefined

  const addButton = (
    <Button
      onClick={handleAddToCart}
      disabled={!canBuy}
      size="large"
      className="w-full rounded-full"
      variant="primary"
      data-testid="add-product-button"
    >
      {t(addLabel)}
    </Button>
  )

  return (
    <>
      {/* In the order a buyer reads it: what it costs, whether it can be had, then the
          button that buys it. What exactly is sold is chosen in the centre card. */}
      <div className="flex flex-col gap-y-3" ref={actionsRef}>
        <ProductPrice product={product} variant={selectedVariant} />

        {selectedVariant && !disabled ? (
          <p
            className="flex items-center gap-x-2 text-sm leading-5"
            data-testid="product-stock"
            data-in-stock={inStock && isValidVariant ? "true" : "false"}
          >
            <span
              aria-hidden
              className={
                inStock && isValidVariant
                  ? "size-2 rounded-full bg-status-success"
                  : "size-2 rounded-full bg-ui-fg-muted"
              }
            />
            <span
              className={
                inStock && isValidVariant
                  ? "text-ui-fg-base"
                  : "text-ui-fg-subtle"
              }
            >
              {inStock && isValidVariant ? t("inStock") : t("outOfStock")}
            </span>
          </p>
        ) : (
          // The line keeps its place while the variant is unknown, so the buttons below
          // do not move when it appears.
          <p className="h-5" aria-hidden />
        )}

        {inCart ? (
          <InCartStepper
            quantity={inCart.quantity}
            max={inCart.max}
            onStep={inCart.onStep}
            addButton={addButton}
          />
        ) : (
          addButton
        )}
        <CartLineError variantId={selectedVariant?.id} data-testid="product-cart-error" />

        <MobileActions
          product={product}
          variant={selectedVariant}
          options={options}
          updateOptions={setOptionValue}
          inStock={inStock}
          handleAddToCart={handleAddToCart}
          inCart={inCart}
          // Hidden while the details drawer is open: it has its own buy footer, and two
          // buy bars on one phone screen is one too many.
          show={scrolledPast && !footerInView && !detailsOpen}
          optionsDisabled={!!disabled}
        />
      </div>
    </>
  )
}
