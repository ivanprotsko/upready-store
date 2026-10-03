"use client"

import { useCartQueue } from "@lib/cart-store"
import { convertToLocale } from "@lib/util/money"
import { isNoDeliveryLine } from "@lib/util/shipping-address"
import { Badge } from "@medusajs/ui"
import type { HttpTypes } from "@medusajs/types"
import { useLocale, useTranslations } from "next-intl"
import DeleteButton from "@modules/common/components/delete-button"
import CartLineError from "@modules/cart/components/cart-line-error"
import { Link } from "@i18n/navigation"
import ProductMedia from "@modules/products/components/product-media"

type ItemProps = {
  item: HttpTypes.StoreCartLineItem
  type?: "full" | "preview"
  currencyCode: string
}

/**
 * One line of the cart page. Its quantity and its removal go through the client cart
 * queue (t-2026-10-03-66): they show at once, the request follows after a pause, and a
 * refused change falls back to the server's quantity with the reason under the line.
 */
const Item = ({ item, type = "full", currencyCode }: ItemProps) => {
  const queue = useCartQueue()
  const locale = useLocale()
  const tShip = useTranslations("Shipments")

  const imageUrl =
    item.thumbnail || item.variant?.product?.images?.[0]?.url || null

  const total = convertToLocale({
    amount: item.total ?? 0,
    currency_code: currencyCode,
    locale,
  })

  const unitPrice = convertToLocale({
    amount: item.unit_price ?? 0,
    currency_code: currencyCode,
    locale,
  })

  // The variant line only when it says something the title does not (today a
  // single-variant product printed its own name twice).
  const variantTitle =
    item.variant?.title && item.variant.title.trim().toLowerCase() !== (item.product_title ?? "").trim().toLowerCase()
      ? item.variant.title
      : null
  // Batch 6, Q3.5: a course is bought once — no «+» beyond 1 for a no-delivery line.
  const noDelivery = isNoDeliveryLine(item)
  const maxQty = noDelivery ? 1 : 10

  const changeQuantity = (quantity: number) => {
    if (item.variant_id) {
      queue.set(item.variant_id, quantity)
    }
  }

  if (type === "preview") {
    return (
      <div className="flex items-center gap-x-3" data-testid="product-row">
        <div className="relative flex-shrink-0">
          <Link href={`/products/${item.product_handle}`}>
            <ProductMedia
              src={imageUrl}
              alt={item.product_title ?? ""}
              context="line"
              className="w-[72px] border border-ui-border-base"
            />
          </Link>
          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-ui-fg-base text-ui-bg-base text-[10px] font-medium flex items-center justify-center leading-none">
            {item.quantity}
          </span>
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-y-0.5">
          <span
            className="txt-compact-medium-plus text-ui-fg-base truncate"
            data-testid="product-title"
          >
            {item.product_title}
          </span>
          {variantTitle && (
            <span className="txt-compact-small text-ui-fg-subtle truncate">
              {variantTitle}
            </span>
          )}
        </div>

        <span className="txt-compact-medium-plus text-ui-fg-base flex-shrink-0">
          {total}
        </span>
      </div>
    )
  }

  return (
    <div
      className="flex items-center justify-between gap-x-4"
      data-testid="product-row"
    >
      <div className="flex items-center gap-x-4">
        <Link
          href={`/products/${item.product_handle}`}
          className="flex-shrink-0"
        >
          <ProductMedia
            src={imageUrl}
            alt={item.product_title ?? ""}
            context="line"
            className="w-24"
          />
        </Link>

        <div className="flex flex-col justify-between min-h-24 py-1">
          <span
            className="txt-medium text-ui-fg-base"
            data-testid="product-title"
          >
            {item.product_title}
          </span>
          {/* `h-auto min-h-6`: on a 390px phone the line's text column is narrower than
              «онлайн-курс, без доставки», and the xsmall badge's fixed `h-6` let the
              second line spill out of it (batch 6 part 1 shots). */}
          {noDelivery ? (
            <Badge size="xsmall" color="blue" className="w-fit h-auto min-h-6" data-testid="line-no-delivery-badge">
              {tShip("noDeliveryBadge")}
            </Badge>
          ) : variantTitle ? (
            <span className="txt-medium text-ui-fg-subtle">{variantTitle}</span>
          ) : null}
          <div className="flex items-end h-[22.4px]">
            <DeleteButton
              id={item.id}
              onDelete={() => changeQuantity(0)}
              data-testid="product-delete-button"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col items-end justify-end min-h-24 py-1 flex-shrink-0 gap-2">
        <span
          className="txt-medium-plus text-ui-fg-base"
          data-testid="product-unit-price"
        >
          {item.quantity > 1 ? `${item.quantity} x ${unitPrice}` : total}
        </span>

        <div className="flex items-center justify-center gap-x-4 h-6 px-2 bg-ui-bg-component shadow-elevation-card-rest rounded-[6px]">
          <button
            type="button"
            onClick={() =>
              item.quantity > 1 && changeQuantity(item.quantity - 1)
            }
            disabled={item.quantity <= 1}
            className="txt-compact-xlarge-plus text-ui-fg-subtle disabled:opacity-40 leading-none"
            data-testid="decrease-qty-button"
          >
            −
          </button>
          <span className="txt-compact-xsmall-plus text-ui-fg-subtle min-w-[12px] text-center">
            {item.quantity}
          </span>
          <button
            type="button"
            onClick={() =>
              item.quantity < maxQty && changeQuantity(item.quantity + 1)
            }
            disabled={item.quantity >= maxQty}
            className="txt-compact-xlarge-plus text-ui-fg-subtle disabled:opacity-40 leading-none"
            data-testid="increase-qty-button"
          >
            +
          </button>
        </div>
      </div>

      <CartLineError variantId={item.variant_id} data-testid="product-error-message" />
    </div>
  )
}

export default Item
