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
import SupplementNotice from "@modules/products/components/supplement-notice"

type ProductDetailsDrawerProps = {
  /** Every characteristic, already cleaned by `prepareAttributeRows`. */
  rows: ProductAttributeRow[]
  /** The description with its HTML stripped (`stripHtml`), or "" when there is none. */
  description: string
  /** «Не является лекарственным средством» for a product marked as a supplement, else null. */
  supplementNotice?: string | null
}

/**
 * «Характеристики и описание»: the шторка Ivan asked for after the Wildberries one. It
 * slides in from the right over a dimmed page (full width on a phone); the header with
 * the title and the X and the footer with the price and «В корзину» stay in place, only
 * the body between them scrolls — all the characteristics as «name ···· value» rows,
 * then the whole description.
 *
 * It opens from the one button at the bottom of the product card
 * (`./opener`); Esc, the X and a click on the dimmed page close it, and focus goes back
 * to that button. The footer buys through `useProductPurchase`, the same code as the buy
 * box, from the priced product the buy box publishes into the selection context.
 *
 * «В корзину» closes the drawer once the line is in the cart (t-2026-10-12-06, Ivan:
 * «похоже в этой панели не работает кнопка "в корзину"»). The line did reach the cart
 * before, but the drawer covered whatever said so: the whole page on a phone, the header's
 * count and «В корзине − N +» below 1024 px, and from 1024 px the cart sidebar opened on
 * the same layer. Now the buyer sees what the buy box's own button shows.
 */
export default function ProductDetailsDrawer({
  rows,
  description,
  supplementNotice = null,
}: ProductDetailsDrawerProps) {
  const t = useTranslations("ProductInfo")
  const tAttributes = useTranslations("ProductAttributes")
  const tActions = useTranslations("ProductActions")
  const tCommon = useTranslations("Common")
  const { detailsOpen, setDetailsOpen, detailsOpenerRef, pricedProduct } =
    useProductSelection()
  const { selectedVariant, canBuy, addLabel, handleAddToCart } =
    useProductPurchase(pricedProduct, !pricedProduct, {
      onAdded: () => setDetailsOpen(false),
    })

  const words = { yes: tAttributes("yes"), no: tAttributes("no") }
  const paragraphs = description ? descriptionParagraphs(description) : []

  return (
    <Drawer open={detailsOpen} onOpenChange={setDetailsOpen}>
      <Drawer.Content
        // Placed with the storefront's own screens: a phone gets the whole screen, from
        // 512 px it is a card on the RIGHT edge, 640 px wide like the Wildberries one,
        // with the same 8 px margin on every side, sliding in from the right as
        // @medusajs/ui's Drawer does by default. Ivan's 12.10.2026 order rules here
        // («панель с харектеристиками и описанием продукта нужно показывать справа»,
        // t-2026-10-12-06); it replaced his 24.09 «1.2 сайдбар должен выезжать слева».
        // `!` keeps the right edge and the width over the component's `max-sm:` defaults
        // regardless of Tailwind's generated rule order across the xsmall/sm breakpoints.
        className="inset-0 z-[80] w-full max-w-none rounded-none border-0 max-sm:inset-x-0 max-sm:w-full xsmall:inset-y-2 xsmall:!right-2 xsmall:!left-auto xsmall:!w-[calc(100%-16px)] xsmall:max-w-[640px] sm:max-w-[640px] xsmall:rounded-lg xsmall:border"
        overlayProps={{ className: "z-[80]" }}
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          // After «В корзину» the cart sidebar is open and holds focus: leave it there.
          const active = document.activeElement
          if (active instanceof HTMLElement && active.closest("[role=dialog]")) {
            return
          }
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

          {supplementNotice && <SupplementNotice text={supplementNotice} />}
        </div>

        {/* The price, then the one primary button on the rest of the row, as in the
            phone's sticky buy bar. */}
        <div
          className="flex shrink-0 items-center gap-x-3 border-t border-ui-border-base px-4 py-4 small:px-6"
          data-testid="product-details-drawer-footer"
        >
          <div className="shrink-0">
            {pricedProduct && (
              <ProductPrice product={pricedProduct} variant={selectedVariant} />
            )}
          </div>
          <Button
            onClick={handleAddToCart}
            disabled={!canBuy}
            size="large"
            variant="primary"
            className="min-w-0 flex-1 rounded-full"
            data-testid="product-details-add"
          >
            {tActions(addLabel)}
          </Button>
        </div>
      </Drawer.Content>
    </Drawer>
  )
}
