"use client"

import { XMark } from "@medusajs/icons"
import { Button, Drawer, IconButton } from "@medusajs/ui"
import { useTranslations } from "next-intl"

import type { ProductAttributeRow } from "@lib/data/product-attributes"
import { descriptionParagraphs } from "@lib/util/strip-html"
import { displayAttributeValue } from "@modules/products/components/product-attributes/rows"
import ProductPrice from "@modules/products/components/product-price"
import { useProductSelection } from "@modules/products/components/product-selection"
import { useProductPurchase } from "@modules/products/components/product-selection/use-product-purchase"

type ProductDetailsDrawerProps = {
  /** Every characteristic, already cleaned by `prepareAttributeRows`. */
  rows: ProductAttributeRow[]
  /** The description with its HTML stripped (`stripHtml`), or "" when there is none. */
  description: string
}

/**
 * «Характеристики и описание»: the шторка Ivan asked for after the Wildberries one. It
 * slides in from the right over a dimmed page (full width on a phone); the header with
 * the title and the X and the footer with the price and the two buy buttons stay in
 * place, only the body between them scrolls — all the characteristics as «name ···· value»
 * rows, then the whole description.
 *
 * It opens from the one button at the bottom of the product card
 * (`./opener`); Esc, the X and a click on the dimmed page close it, and focus goes back
 * to that button. The footer buys through `useProductPurchase`, the same code as the buy
 * box, from the priced product the buy box publishes into the selection context.
 */
export default function ProductDetailsDrawer({
  rows,
  description,
}: ProductDetailsDrawerProps) {
  const t = useTranslations("ProductInfo")
  const tAttributes = useTranslations("ProductAttributes")
  const tActions = useTranslations("ProductActions")
  const tCommon = useTranslations("Common")
  const { detailsOpen, setDetailsOpen, detailsOpenerRef, pricedProduct } =
    useProductSelection()
  const { selectedVariant, isAdding, canBuy, handleAddToCart, handleBuyNow } =
    useProductPurchase(pricedProduct, !pricedProduct)

  const words = { yes: tAttributes("yes"), no: tAttributes("no") }
  const paragraphs = description ? descriptionParagraphs(description) : []

  return (
    <Drawer open={detailsOpen} onOpenChange={setDetailsOpen}>
      <Drawer.Content
        // Placed with the storefront's own screens: a phone gets the whole screen, from
        // 512 px it is a card on the LEFT, 640 px wide like the Wildberries one (Ivan,
        // 2026-09-24: «1.2 сайдбар должен выезжать слева»). `!` forces the left position
        // and slide-in direction over @medusajs/ui's own right-side defaults regardless
        // of Tailwind's generated rule order across the xsmall/sm breakpoints.
        className="inset-0 z-[80] w-full max-w-none rounded-none border-0 max-sm:inset-x-0 max-sm:w-full xsmall:inset-y-2 xsmall:!right-auto xsmall:!left-2 xsmall:max-w-[640px] sm:!right-auto sm:!left-2 sm:max-w-[640px] xsmall:rounded-lg xsmall:border data-[state=open]:!slide-in-from-left-1/2 data-[state=closed]:!slide-out-to-left-1/2"
        overlayProps={{ className: "z-[80]" }}
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          detailsOpenerRef.current?.focus()
        }}
        data-testid="product-details-drawer"
      >
        <div className="flex shrink-0 items-center justify-between gap-x-4 border-b border-ui-border-base px-4 py-4 small:px-6">
          <Drawer.Title className="text-lg font-semibold leading-7 text-ui-fg-base small:text-xl">
            {t("details")}
          </Drawer.Title>
          <Drawer.Close asChild>
            <IconButton
              type="button"
              variant="transparent"
              aria-label={tCommon("close")}
              data-testid="product-details-drawer-close"
            >
              <XMark />
            </IconButton>
          </Drawer.Close>
        </div>

        <div
          className="flex min-h-0 flex-1 flex-col gap-y-8 overflow-y-auto overscroll-contain px-4 py-5 small:px-6 small:py-6"
          data-testid="product-details-drawer-body"
        >
          {rows.length > 0 && (
            <section className="flex flex-col gap-y-3">
              <h3 className="text-base font-semibold leading-6 text-ui-fg-base">
                {tAttributes("title")}
              </h3>
              <dl className="flex flex-col gap-y-2">
                {rows.map((row) => (
                  <div
                    key={row.key}
                    className="flex items-baseline gap-x-1.5 text-sm leading-6"
                    data-testid={`product-details-attribute-${row.key}`}
                  >
                    {/* The name never shrinks below its own length: a long name wraps, a
                        long value wraps under itself, the leader takes what is left. */}
                    <dt className="max-w-[50%] shrink-0 text-ui-fg-subtle">
                      {row.name}
                    </dt>
                    <span
                      aria-hidden
                      className="mb-1.5 min-w-4 flex-1 border-b border-dotted border-ui-border-strong"
                    />
                    <dd className="min-w-0 max-w-[50%] break-words text-right text-ui-fg-base">
                      {displayAttributeValue(row, words)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {paragraphs.length > 0 && (
            <section
              className="flex flex-col gap-y-3"
              data-testid="product-details-description"
            >
              <h3 className="text-base font-semibold leading-6 text-ui-fg-base">
                {t("description")}
              </h3>
              {paragraphs.map((paragraph, position) => (
                <p
                  key={position}
                  className="whitespace-pre-line text-sm leading-6 text-ui-fg-base"
                >
                  {paragraph}
                </p>
              ))}
            </section>
          )}
        </div>

        <div
          className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-ui-border-base px-4 py-4 small:px-6"
          data-testid="product-details-drawer-footer"
        >
          <div className="min-w-0 flex-1">
            {pricedProduct && (
              <ProductPrice product={pricedProduct} variant={selectedVariant} />
            )}
          </div>
          <div className="flex gap-x-2">
            <Button
              onClick={handleBuyNow}
              disabled={!canBuy}
              size="large"
              variant="secondary"
              className="rounded-full"
              data-testid="product-details-buy-now"
            >
              {tActions("buy")}
            </Button>
            <Button
              onClick={handleAddToCart}
              disabled={!canBuy}
              isLoading={isAdding}
              size="large"
              variant="primary"
              className="rounded-full"
              data-testid="product-details-add"
            >
              {tActions("addToCart")}
            </Button>
          </div>
        </div>
      </Drawer.Content>
    </Drawer>
  )
}
