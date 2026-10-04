"use client"

import type { HttpTypes } from "@medusajs/types"
import { convertToLocale } from "@lib/util/money"
import { isNoDeliveryLine } from "@lib/util/shipping-address"
import { cartShipmentLines, shipmentGroups } from "@lib/util/shipment-groups"
import { Badge } from "@medusajs/ui"
import DeleteButton from "@modules/common/components/delete-button"
import ProductMedia from "@modules/products/components/product-media"
import { Link } from "@i18n/navigation"
import { useLocale, useTranslations } from "next-intl"

interface CheckoutItemListProps {
  cart: HttpTypes.StoreCart
}

function CheckoutItem({
  item,
  currencyCode,
}: {
  item: HttpTypes.StoreCartLineItem
  currencyCode: string
}) {
  const locale = useLocale()
  const t = useTranslations("CheckoutPage")
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
  const noDelivery = isNoDeliveryLine(item)

  return (
    <div className="flex items-center justify-between gap-x-4">
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

        <div className="flex flex-col min-h-24 py-1 justify-between">
          <span className="txt-medium text-ui-fg-base">
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
            <DeleteButton id={item.id} data-testid="product-delete-button" />
          </div>
        </div>
      </div>

      <div className="flex flex-col items-end justify-end min-h-24 py-1 flex-shrink-0 gap-2">
        <span className="txt-medium-plus text-ui-fg-base">
          {item.quantity > 1 ? `${item.quantity} x ${unitPrice}` : total}
        </span>

        {/* Ivan 04.10 08:40 (t-2026-10-04-22): the checkout shows how many, it does not
            change it — «1 шт.» as text, no − / + stepper. The cart keeps its stepper. */}
        <span className="txt-compact-small text-ui-fg-subtle" data-testid="checkout-item-quantity">
          {t("quantity", { quantity: item.quantity })}
        </span>
      </div>
    </div>
  )
}

/**
 * The lines grouped by shipment (batch 6): «Отправление № N» for what is posted, the
 * online course in its own group without a number — the same `shipmentGroups` the
 * cart sidebar and the order page read, so the numbers match everywhere.
 */
export default function CheckoutItemList({ cart }: CheckoutItemListProps) {
  const t = useTranslations("CheckoutPage")
  const tShip = useTranslations("Shipments")
  const items = cart.items
    ? [...cart.items].sort((a, b) =>
        (a.created_at ?? "") > (b.created_at ?? "") ? -1 : 1
      )
    : []
  const groups = shipmentGroups(cartShipmentLines(items))
  const showGroupHeaders = groups.length > 1 || groups.some((group) => group.kind === "digital")

  return (
    <div>
      <h2 className="h2-docs mb-3">{t("orderComposition")}</h2>
      <div className="flex flex-col gap-y-6">
        {groups.map((group) => (
          <div
            key={group.key}
            className="flex flex-col"
            data-testid={`shipment-group-${group.kind}`}
            data-shipment-no={group.no ?? undefined}
          >
            {showGroupHeaders && (
              <p className="txt-compact-small-plus text-ui-fg-subtle mb-3">
                {group.kind === "physical"
                  ? tShip("shipmentNo", { no: group.no ?? 1 })
                  : tShip("digitalGroup")}
              </p>
            )}
            {group.lines.map(({ item }, idx) => (
              <div key={item.id}>
                <CheckoutItem item={item} currencyCode={cart.currency_code} />
                {idx < group.lines.length - 1 && (
                  <div className="h-px bg-ui-border-base my-3" />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
