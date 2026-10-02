import type { HttpTypes } from "@medusajs/types"
import { Button } from "@medusajs/ui"
import { getLocale, getTranslations } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { formatDate } from "@lib/util/date"
import { convertToLocale } from "@lib/util/money"
import { getOrderPickupPoint } from "@lib/util/fulfillment"
import { isNoDeliveryLine } from "@lib/util/shipping-address"
import Thumbnail from "@modules/products/components/thumbnail"
import { OrderStatusDot } from "@modules/account/components/status-dot"
import { BuyerStatusDot } from "@modules/order/components/buyer-status"

type OrderCardProps = {
  order: HttpTypes.StoreOrder
}

/** How many item thumbnails fit before the card starts counting the rest. */
const PREVIEW_LIMIT = 4

/**
 * Server component: the async `OrderStatusDot`/label lookups both need
 * `next-intl/server`, unavailable from a client tree. Nothing this card
 * renders needs `"use client"` — the line-count reduce and the shipping-line
 * pick are synchronous, so a server component does the same work for free.
 */
const OrderCard = async ({ order }: OrderCardProps) => {
  const t = await getTranslations("OrderCard")
  const tc = await getTranslations("Common")
  const locale = await getLocale()

  const numberOfLines =
    order.items?.reduce((acc, item) => acc + item.quantity, 0) ?? 0

  const preview = order.items?.slice(0, PREVIEW_LIMIT) ?? []
  const remaining = (order.items?.length ?? 0) - preview.length

  // The mockup's NEW meta line (§3a): the pickup point's name once a real
  // "pickup" fulfillment set exists (map §2, seeded by W14), or the chosen
  // shipping method's real name/price otherwise — never an invented
  // "Standard shipping" placeholder.
  const pickupPoint = getOrderPickupPoint(order)
  // Batch 7: an order of an online course alone has nothing to post — no shipping
  // line and no fulfillment dot, only the buyer's payment status.
  const shipsSomething = (order.items ?? []).some((item) => !isNoDeliveryLine(item))
  const shippingMethod = order.shipping_methods?.[0] as
    | { name?: string; total?: number }
    | undefined
  const shippingLine = !shipsSomething
    ? null
    : pickupPoint
    ? t("pickupAt", { name: pickupPoint.name })
    : shippingMethod?.name
      ? `${shippingMethod.name} · ${convertToLocale({
          amount: shippingMethod.total ?? 0,
          currency_code: order.currency_code,
          locale,
        })}`
      : null

  return (
    <div
      className="flex flex-col gap-y-4 rounded-lg border border-ui-border-base p-4 small:p-6"
      data-testid="order-card"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className="text-large-semi text-ui-fg-base"
          data-testid="order-display-id"
          data-value={order.display_id}
        >
          {tc("orderNumber", { id: order.display_id ?? order.id })}
        </span>
        <BuyerStatusDot order={order} />
        {shipsSomething && order.status !== "canceled" && (
          <OrderStatusDot kind="fulfillment" status={order.fulfillment_status} />
        )}
      </div>

      <div className="flex items-center divide-x rtl:divide-x-reverse divide-ui-border-base txt-small text-ui-fg-subtle">
        <span className="pe-2" data-testid="order-created-at">
          {formatDate({ date: order.created_at, locale, dateStyle: "medium" })}
        </span>
        <span className="px-2 tabular-nums" data-testid="order-amount">
          {convertToLocale({
            amount: order.total,
            currency_code: order.currency_code,
            locale,
          })}
        </span>
        <span className="ps-2">{t("itemsCount", { count: numberOfLines })}</span>
      </div>

      {shippingLine && (
        <span
          className="txt-small text-ui-fg-subtle"
          data-testid="order-shipping-line"
          data-value={pickupPoint ? "pickup" : "courier"}
        >
          {shippingLine}
        </span>
      )}

      {/* The thumbnails used to be full-width cards in a four-column grid, so a
          two-item order filled most of the screen. They are a preview, not the
          order. */}
      <div className="flex flex-wrap items-center gap-3">
        {preview.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-x-2"
            data-testid="order-item"
          >
            <div className="w-12 shrink-0">
              <Thumbnail
                thumbnail={item.thumbnail}
                images={[]}
                alt={item.product_title ?? item.title ?? ""}
                size="square"
              />
            </div>
            <span className="txt-small text-ui-fg-subtle">
              <span className="text-ui-fg-base" data-testid="item-title">
                {item.title}
              </span>
              <span className="ms-1 tabular-nums" data-testid="item-quantity">
                ×{item.quantity}
              </span>
            </span>
          </div>
        ))}
        {remaining > 0 && (
          <span className="txt-small text-ui-fg-subtle">
            + {remaining} {t("more")}
          </span>
        )}
      </div>

      <div className="flex justify-end">
        <Link href={`/account/orders/details/${order.id}`}>
          <Button data-testid="order-details-link" variant="secondary">
            {t("seeDetails")}
          </Button>
        </Link>
      </div>
    </div>
  )
}

export default OrderCard
