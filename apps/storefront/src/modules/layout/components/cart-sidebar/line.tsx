"use client"

import { Minus, Plus } from "@medusajs/icons"
import type { HttpTypes } from "@medusajs/types"
import { Badge, IconButton, Text } from "@medusajs/ui"
import { useLocale, useTranslations } from "next-intl"
import { useCartQueue } from "@lib/cart-store"
import { convertToLocale } from "@lib/util/money"
import { isNoDeliveryLine } from "@lib/util/shipping-address"
import { Link } from "@i18n/navigation"
import CartLineError from "@modules/cart/components/cart-line-error"
import { maxQuantity } from "@modules/products/components/in-cart-stepper/logic"
import ProductMedia from "@modules/products/components/product-media"
import WishlistButton from "@modules/products/components/wishlist-button"

/**
 * The variant line under the title only when it says something the title does not:
 * today «Набор для очищения лимфы / Набор для очищения лимфы» was printed twice because
 * a single-variant product's variant carries the product's own name.
 */
export const variantLabel = (
  item: Pick<HttpTypes.StoreCartLineItem, "product_title" | "variant_title" | "title">
): string | null => {
  const variant = item.variant_title?.trim()
  if (!variant) return null
  const product = (item.product_title ?? item.title)?.trim()
  return product && variant.toLowerCase() === product.toLowerCase() ? null : variant
}

/**
 * One line of the cart sidebar, after the frame's «CartItem» card: the picture, the
 * variant badge, the title once, the price, the heart and the «− N +» stepper. «−» on
 * the last one removes the line, the same rule as the product page's «В КОРЗИНЕ − N +»
 * (`in-cart-stepper`), so the card needs no separate remove control. «+» stops at the
 * variant's stock (`maxQuantity`), the rule that stepper already follows.
 *
 * The quantity is the client cart queue's (t-2026-10-03-66): «+» and «−» change it at
 * once, as fast as the buyer clicks, and the queue sends the result after a pause. A
 * refused change falls back to the server's quantity and says why under the card.
 */
export default function CartSidebarLine({
  item,
  currencyCode,
  wishlistLoggedIn,
  wishlistActive,
}: {
  item: HttpTypes.StoreCartLineItem
  currencyCode: string
  /** Whether the heart writes to the account (signed in) or to this browser (a guest). */
  wishlistLoggedIn: boolean
  /** Whether this product is on the signed-in buyer's list, as the server rendered it. */
  wishlistActive: boolean
}) {
  const t = useTranslations("ProductActions")
  const tCommon = useTranslations("Common")
  const tShip = useTranslations("Shipments")
  const locale = useLocale()
  const queue = useCartQueue()
  const quantity = item.quantity

  const imageUrl = item.thumbnail || item.variant?.product?.images?.[0]?.url || null
  const title = item.product_title ?? item.title
  const variant = variantLabel(item)
  // Batch 6, Q3.5: a course is bought once — no «+» beyond 1 for a no-delivery line.
  const noDelivery = isNoDeliveryLine(item)
  const max = noDelivery ? 1 : maxQuantity(item.variant)

  const money = (amount: number) =>
    convertToLocale({ amount, currency_code: currencyCode, locale })
  const unitPrice = money(item.unit_price ?? 0)
  const total = money(item.total ?? (item.unit_price ?? 0) * quantity)

  const press = (delta: 1 | -1) => {
    const next = quantity + delta
    if (!item.variant_id || (delta > 0 && next > max)) return
    queue.set(item.variant_id, next)
  }

  const href = item.product_handle ? `/products/${item.product_handle}` : null

  return (
    <div
      className="rounded-lg bg-ui-bg-base p-3"
      data-testid="cart-sidebar-line"
      data-line-id={item.id}
    >
      <div className="flex gap-x-3">
        {href ? (
          <Link href={href} className="shrink-0" tabIndex={-1} aria-hidden>
            <ProductMedia src={imageUrl} alt="" context="line" className="w-[72px]" />
          </Link>
        ) : (
          <ProductMedia src={imageUrl} alt="" context="line" className="w-[72px] shrink-0" />
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-y-2 border-l border-dotted border-ui-border-strong pl-3">
          <div className="flex min-h-7 items-start justify-between gap-x-2">
            {noDelivery ? (
              <Badge size="xsmall" color="blue" className="max-w-full truncate" data-testid="line-no-delivery-badge">
                {tShip("noDeliveryBadge")}
              </Badge>
            ) : variant ? (
              <Badge size="xsmall" className="max-w-full truncate" data-testid="cart-sidebar-line-variant">
                {variant}
              </Badge>
            ) : (
              <span />
            )}
            {item.product_id ? (
              <WishlistButton
                productId={item.product_id}
                initialActive={wishlistActive}
                isLoggedIn={wishlistLoggedIn}
                className="-mr-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ui-fg-subtle transition-colors hover:text-ui-fg-base disabled:opacity-60"
              />
            ) : null}
          </div>

          {href ? (
            <Link
              href={href}
              className="txt-compact-medium-plus line-clamp-2 text-ui-fg-base"
              data-testid="cart-sidebar-line-title"
            >
              {title}
            </Link>
          ) : (
            <Text size="small" weight="plus" leading="compact" className="line-clamp-2" data-testid="cart-sidebar-line-title">
              {title}
            </Text>
          )}

          <div className="flex items-center justify-between gap-x-2">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
              <span className="txt-compact-small-plus text-ui-fg-base" data-testid="cart-sidebar-line-total">
                {total}
              </span>
              {quantity > 1 ? (
                <span className="txt-compact-xsmall text-ui-fg-subtle" data-testid="cart-sidebar-line-unit">
                  {quantity} × {unitPrice}
                </span>
              ) : null}
            </div>

            <div
              role="group"
              aria-label={t("inCart")}
              className="flex shrink-0 items-center gap-x-1"
              data-testid="cart-sidebar-stepper"
            >
              <IconButton
                type="button"
                variant="transparent"
                size="small"
                onClick={() => press(-1)}
                disabled={!item.variant_id}
                aria-label={quantity > 1 ? t("decreaseQuantity") : tCommon("remove")}
                data-testid="cart-sidebar-decrease"
              >
                <Minus />
              </IconButton>
              <span
                aria-live="polite"
                className="txt-compact-small-plus min-w-[1.5rem] text-center tabular-nums text-ui-fg-base"
                data-testid="cart-sidebar-quantity"
              >
                {quantity}
              </span>
              <IconButton
                type="button"
                variant="transparent"
                size="small"
                onClick={() => press(1)}
                disabled={!item.variant_id || quantity >= max}
                aria-label={t("increaseQuantity")}
                data-testid="cart-sidebar-increase"
              >
                <Plus />
              </IconButton>
            </div>
          </div>
        </div>
      </div>

      <CartLineError variantId={item.variant_id} data-testid="cart-sidebar-line-error" />
    </div>
  )
}
