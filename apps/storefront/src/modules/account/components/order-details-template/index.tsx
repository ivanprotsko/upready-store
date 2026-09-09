import type { HttpTypes } from "@medusajs/types"
import { Heading } from "@medusajs/ui"
import { Link } from "@i18n/navigation"
import ChevronDown from "@modules/common/icons/chevron-down"
import Help from "@modules/order/components/help"
import Items from "@modules/order/components/items"
import OrderDetails from "@modules/order/components/order-details"
import OrderSection from "@modules/order/components/order-section"
import OrderSummary from "@modules/order/components/order-summary"
import PaymentDetails from "@modules/order/components/payment-details"
import ShippingDetails from "@modules/order/components/shipping-details"
import { getTranslations } from "next-intl/server"

import { getOrderPickupPoint } from "@lib/util/fulfillment"
import OrderTimeline from "@modules/account/components/order-timeline"
import { OrderStatusDot } from "@modules/account/components/status-dot"

/**
 * The account copy of an order's detail page (`account-mockup.md` §4). Same
 * sections as `modules/order/templates/order-details-template.tsx` (the
 * confirmation page's template — out of this package's scope, left
 * unchanged), plus two account-only additions: a `StatusDot` pair or the full
 * `OrderTimeline` in place of the old `StatusBadge` pair, and a "Pickup
 * point" section that REPLACES `ShippingDetails` for a pickup order (§4a: the
 * drawn frame shows no separate shipping-details section once a pickup point
 * is set — Contact/Method stay off-screen there, matching the mockup rather
 * than merging them into one section).
 */

type OrderDetailsTemplateProps = {
  order: HttpTypes.StoreOrder
}

const OrderDetailsTemplate = async ({ order }: OrderDetailsTemplateProps) => {
  const t = await getTranslations("OrderDetails")
  const tc = await getTranslations("Common")
  const th = await getTranslations("Help")
  const ts = await getTranslations("ShippingDetails")
  const tp = await getTranslations("PaymentDetails")
  const to = await getTranslations("OrderSummary")
  const tpp = await getTranslations("PickupPoint")

  const hasPayment = Boolean(order.payment_collections?.[0]?.payments?.[0])
  const pickupPoint = getOrderPickupPoint(order)

  return (
    <div className="flex flex-col gap-y-8" data-testid="order-details-container">
      <div className="flex flex-col gap-y-3">
        {/* A back link belongs above the title it leads away from, and the
            chevron says "back" where the close icon it replaces said "leave". */}
        <Link
          href="/account/orders"
          className="flex w-fit items-center gap-x-1 txt-compact-small text-ui-fg-subtle hover:text-ui-fg-base"
          data-testid="back-to-overview-button"
        >
          <ChevronDown className="rotate-90 rtl:-rotate-90" size={16} />
          {t("backToOrders")}
        </Link>

        <Heading level="h1" className="text-2xl-semi text-ui-fg-base">
          {tc("orderNumber", { id: order.display_id ?? order.id })}
        </Heading>
        {/* The number is in the heading now, so the meta row below would only
            repeat it three lines later. Status renders below, either the
            timeline (a pickup order) or the dot pair (a courier order). */}
        <OrderDetails order={order} showStatus={false} showOrderNumber={false} />

        {pickupPoint ? (
          <div className="mt-2">
            <OrderTimeline order={order} />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
            <OrderStatusDot kind="fulfillment" status={order.fulfillment_status} />
            <OrderStatusDot kind="payment" status={order.payment_status} />
          </div>
        )}
      </div>

      <OrderSection title={t("items")}>
        <Items order={order} />
      </OrderSection>

      <OrderSection title={to("heading")}>
        <OrderSummary order={order} />
      </OrderSection>

      {pickupPoint ? (
        <OrderSection title={tpp("heading")} data-testid="pickup-point-summary">
          <div className="flex flex-col gap-y-1 txt-medium text-ui-fg-subtle">
            <span
              className="text-ui-fg-base txt-medium-plus"
              data-testid="pickup-point-name"
            >
              {pickupPoint.name}
            </span>
            {(pickupPoint.address || pickupPoint.hours) && (
              <span data-testid="pickup-point-address">
                {[pickupPoint.address, pickupPoint.hours].filter(Boolean).join(" · ")}
              </span>
            )}
            <span className="txt-compact-small">{tpp("idReminder")}</span>
          </div>
        </OrderSection>
      ) : (
        <OrderSection title={ts("heading")}>
          <ShippingDetails order={order} />
        </OrderSection>
      )}

      {hasPayment && (
        <OrderSection title={tp("heading")}>
          <PaymentDetails order={order} />
        </OrderSection>
      )}

      <OrderSection title={th("needHelp")}>
        <Help />
      </OrderSection>
    </div>
  )
}

export default OrderDetailsTemplate
