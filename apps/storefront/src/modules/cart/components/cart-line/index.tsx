"use client"

import { Minus, Plus } from "@medusajs/icons"
import type { HttpTypes } from "@medusajs/types"
import { Badge, IconButton } from "@medusajs/ui"
import { useLocale, useTranslations } from "next-intl"

import { useCartQueue } from "@lib/cart-store"
import { convertToLocale } from "@lib/util/money"
import { isNoDeliveryLine } from "@lib/util/shipping-address"
import { Link } from "@i18n/navigation"
import CartLineError from "@modules/cart/components/cart-line-error"
import { variantLabel } from "@modules/layout/components/cart-sidebar/line"
import { maxQuantity } from "@modules/products/components/in-cart-stepper/logic"
import ProductMedia from "@modules/products/components/product-media"
import WishlistButton from "@modules/products/components/wishlist-button"

/**
 * The column tracks of the cart page's table, shared by the captions and by every line
 * so the columns stay aligned down the list: picture, name, price, quantity, line total,
 * heart. Under 768 px a line is a compact block instead (picture, then name and heart
 * over stepper and total), and the captions are hidden.
 */
export const CART_ROW_COLUMNS =
  "md:grid-cols-[72px_minmax(0,1fr)_6rem_6rem_6rem_1.75rem] md:gap-x-4 small:grid-cols-[64px_minmax(0,1fr)_5.5rem_5.75rem_5.5rem_1.75rem] small:gap-x-3 medium:grid-cols-[88px_minmax(0,1fr)_6rem_6rem_6rem_1.75rem] medium:gap-x-4"

/**
 * One line of the cart page's table (t-2026-10-06-11, Ivan 06.10: «На скриншотах обрати
 * внимание на сбаланисрованость»): picture, name, price, quantity and line total as
 * aligned columns. It follows the rules of the cart sidebar's card
 * (`cart-sidebar/line.tsx`) and keeps its test ids. «−» on the last one removes the
 * line, «+» stops at the variant's stock, and a course is bought once. The quantity is
 * the client cart queue's (t-2026-10-03-66), and a refused change says why under the
 * line.
 */
export default function CartLine({
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
  const media = <ProductMedia src={imageUrl} alt="" context="line" className="w-full" />

  return (
    <div
      className={`grid grid-cols-[72px_minmax(0,1fr)_auto] gap-x-3 gap-y-2 border-b border-ui-border-base py-4 md:items-center ${CART_ROW_COLUMNS}`}
      data-testid="cart-sidebar-line"
      data-line-id={item.id}
    >
      <div className="row-span-2 self-start md:row-span-1 md:self-center">
        {href ? (
          <Link href={href} className="block" tabIndex={-1} aria-hidden>
            {media}
          </Link>
        ) : (
          media
        )}
      </div>

      <div className="flex min-w-0 flex-col items-start gap-y-1">
        {noDelivery ? (
          <Badge size="xsmall" color="blue" className="max-w-full truncate" data-testid="line-no-delivery-badge">
            {tShip("noDeliveryBadge")}
          </Badge>
        ) : variant ? (
          <Badge size="xsmall" className="max-w-full truncate" data-testid="cart-sidebar-line-variant">
            {variant}
          </Badge>
        ) : null}
        {href ? (
          <Link
            href={href}
            className="txt-compact-medium-plus line-clamp-2 text-ui-fg-base"
            data-testid="cart-sidebar-line-title"
          >
            {title}
          </Link>
        ) : (
          <span className="txt-compact-medium-plus line-clamp-2 text-ui-fg-base" data-testid="cart-sidebar-line-title">
            {title}
          </span>
        )}
        {quantity > 1 ? (
          <span className="txt-compact-xsmall text-ui-fg-subtle md:hidden" data-testid="cart-sidebar-line-unit">
            {quantity} × {unitPrice}
          </span>
        ) : null}
      </div>

      <span
        className="txt-compact-small hidden text-end tabular-nums text-ui-fg-subtle md:block"
        data-testid="cart-line-unit-price"
      >
        {unitPrice}
      </span>

      <div
        role="group"
        aria-label={t("inCart")}
        className="col-start-2 row-start-2 flex items-center gap-x-1 justify-self-start md:col-start-auto md:row-start-auto md:justify-self-center"
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

      <span
        className="txt-compact-small-plus col-start-3 row-start-2 self-center text-end tabular-nums text-ui-fg-base md:col-start-auto md:row-start-auto"
        data-testid="cart-sidebar-line-total"
      >
        {total}
      </span>

      <div className="col-start-3 row-start-1 flex justify-end self-start md:col-start-auto md:row-start-auto md:self-center">
        {item.product_id ? (
          <WishlistButton
            productId={item.product_id}
            initialActive={wishlistActive}
            isLoggedIn={wishlistLoggedIn}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ui-fg-subtle transition-colors hover:text-ui-fg-base disabled:opacity-60"
          />
        ) : null}
      </div>

      <div className="col-span-full empty:hidden">
        <CartLineError variantId={item.variant_id} data-testid="cart-sidebar-line-error" />
      </div>
    </div>
  )
}
