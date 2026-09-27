"use client"

import type { HttpTypes } from "@medusajs/types"
import { Button } from "@medusajs/ui"
import { useProductSelection } from "@modules/products/components/product-selection"
import { useProductPurchase } from "@modules/products/components/product-selection/use-product-purchase"
import InCartStepper from "@modules/products/components/in-cart-stepper"
import {
  maxQuantity,
  type CartLinesByVariant,
} from "@modules/products/components/in-cart-stepper/logic"
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
   * The cart's lines by variant (the Olavka shop, Ivan's remark 24): with them a variant in
   * the cart shows «В КОРЗИНЕ − N +» in place of «В корзину». Absent: today's button.
   */
  cartLines?: CartLinesByVariant
}

/**
 * The buy box: the right-hand card of the product page. Price, availability, «В корзину»
 * and «Оплатить», and the phone's sticky bar.
 *
 * Which variant is meant comes from `ProductSelectionProvider`: the pickers live in the
 * centre card, this card only spends the choice. The provider knows the variant by id
 * from the page's own product; the price and the stock are read off THIS component's
 * product, the one fetched with the region's prices.
 */
export default function ProductActions({
  product,
  disabled,
  cartLines,
}: ProductActionsProps) {
  const t = useTranslations("ProductActions")
  const { options, setOptionValue, detailsOpen, setPricedProduct } =
    useProductSelection()
  const {
    selectedVariant,
    inStock,
    isValidVariant,
    isAdding,
    canBuy,
    handleAddToCart,
    handleBuyNow,
  } = useProductPurchase(product, disabled)

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

  const buttonLabel = !selectedVariant
    ? t("selectVariant")
    : !inStock || !isValidVariant
    ? t("outOfStock")
    : t("addToCart")

  // The variant's cart line, or null; undefined when the shop has no «В корзине» state.
  const inCart =
    cartLines && selectedVariant && !disabled
      ? { line: cartLines[selectedVariant.id] ?? null, max: maxQuantity(selectedVariant) }
      : undefined

  const addButton = (
    <Button
      onClick={handleAddToCart}
      disabled={!canBuy}
      size="large"
      className="w-full rounded-full"
      variant="primary"
      isLoading={isAdding}
      data-testid="add-product-button"
    >
      {buttonLabel}
    </Button>
  )

  return (
    <>
      {/* In the order a buyer reads it: what it costs, whether it can be had, then the
          two ways to buy it. What exactly is sold is chosen in the centre card. */}
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
                  ? "size-2 rounded-full bg-ui-tag-green-icon"
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
          <InCartStepper line={inCart.line} max={inCart.max} addButton={addButton} />
        ) : (
          addButton
        )}
        <Button
          onClick={handleBuyNow}
          disabled={!canBuy}
          size="large"
          className="w-full rounded-full"
          variant="secondary"
          data-testid="buy-now-button"
        >
          {t("buyNow")}
        </Button>

        <MobileActions
          product={product}
          variant={selectedVariant}
          options={options}
          updateOptions={setOptionValue}
          inStock={inStock}
          handleAddToCart={handleAddToCart}
          isAdding={isAdding}
          inCart={inCart}
          // Hidden while the details drawer is open: it has its own buy footer, and two
          // buy bars on one phone screen is one too many.
          show={scrolledPast && !footerInView && !detailsOpen}
          optionsDisabled={!!disabled || isAdding}
        />
      </div>
    </>
  )
}
