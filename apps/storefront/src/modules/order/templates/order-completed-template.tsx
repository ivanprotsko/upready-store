import { Button, Text } from "@medusajs/ui"
import { cookies as nextCookies } from "next/headers"

import { Link } from "@i18n/navigation"
import { isNoDeliveryLine } from "@lib/util/shipping-address"

import Help from "@modules/order/components/help"
import Items from "@modules/order/components/items"
import ManualPaymentHandover from "@modules/order/components/manual-payment-handover"
import OnboardingCta from "@modules/order/components/onboarding-cta"
import OrderDetails from "@modules/order/components/order-details"
import OrderSection from "@modules/order/components/order-section"
import { OrderStageBlock } from "@modules/order/components/order-stage"
import OrderSummary from "@modules/order/components/order-summary"
import PaymentDetails from "@modules/order/components/payment-details"
import RobokassaConfirming from "@modules/order/components/robokassa-confirming"
import ShippingDetails from "@modules/order/components/shipping-details"
import PurchaseEvent from "@modules/common/components/purchase-event"
import { getTenantAnalytics } from "@lib/data/analytics"
import { robokassaOrderPayment } from "@lib/util/robokassa-order"
import type { HttpTypes } from "@medusajs/types"
import { getLocale, getTranslations } from "next-intl/server"

type OrderCompletedTemplateProps = {
  order: HttpTypes.StoreOrder
}

export default async function OrderCompletedTemplate({
  order,
}: OrderCompletedTemplateProps) {
  const cookies = await nextCookies()
  const t = await getTranslations("OrderCompleted")
  const td = await getTranslations("OrderDetails")
  const th = await getTranslations("Help")
  const ts = await getTranslations("ShippingDetails")
  const tp = await getTranslations("PaymentDetails")
  const to = await getTranslations("OrderSummary")
  const locale = await getLocale()

  const isOnboarding = cookies.get("_medusa_onboarding")?.value === "true"
  const hasPayment = Boolean(order.payment_collections?.[0]?.payments?.[0])

  // Batch 6: the page by status. Cancelled: no payment details, no «Я оплатил».
  // Paid: the course link for a course line. A course alone has no delivery
  // block. The heading and its sentence are the order's stage (`OrderStageBlock`).
  const isCanceled = order.status === "canceled"
  const isPaid = order.payment_status === "captured"
  // t-2026-10-12-13: a Robokassa order is paid for the buyer once Robokassa's
  // payment exists (the return proved it, the Result captures it), and one
  // placed while Robokassa's confirmation is on its way says so and refreshes
  // itself. The course link waits for the capture, which is what grants it.
  const robokassa = isCanceled ? null : robokassaOrderPayment(order)
  const paidForBuyer = isPaid || robokassa === "paid"
  const confirming = robokassa === "confirming"
  const items = order.items ?? []
  const courseLine = items.find((item) => isNoDeliveryLine(item))
  const shipsSomething = items.some((item) => !isNoDeliveryLine(item))

  // t17-analytics step 4: the standard purchase event, sent once for this
  // order to whichever counters this tenant configured. `getTenantAnalytics`
  // only reads a request header, so this costs no extra round trip; a
  // failure inside `PurchaseEvent` itself can never take down this page —
  // see its own doc comment.
  const analytics = await getTenantAnalytics()
  const yandexCounterId = analytics.yandexMetricaId
    ? Number.parseInt(analytics.yandexMetricaId, 10)
    : null

  return (
    <div className="content-container max-w-4xl py-12 flex flex-col gap-y-8">
      <PurchaseEvent
        orderId={order.id}
        total={order.total}
        currencyCode={order.currency_code}
        ga4MeasurementId={analytics.ga4MeasurementId}
        yandexCounterId={yandexCounterId}
      />
      {isOnboarding && <OnboardingCta orderId={order.id} />}

      <div
        className="flex flex-col gap-y-8"
        data-testid="order-complete-container"
      >
        {/* t-2026-10-14-58, step C: one stage in place of the heading that
            said «Оплата подтверждена» over the badges «Оплачен» + «Отправлен».
            The block names it, says what comes next, draws this order's steps
            and shows the tracking number as soon as there is one. */}
        <div className="flex flex-col gap-y-3">
          <OrderStageBlock
            order={order}
            hint={confirming ? <RobokassaConfirming /> : undefined}
          >
            {isPaid && courseLine?.product_handle && (
              <div data-testid="order-payment-confirmed">
                <Button asChild size="large" data-testid="order-go-to-course">
                  <Link href={`/products/${courseLine.product_handle}`}>{t("goToCourse")}</Link>
                </Button>
              </div>
            )}
          </OrderStageBlock>
          <OrderDetails order={order} locale={locale} />
          {!isCanceled && !paidForBuyer && (
            <Text className="txt-medium text-ui-fg-subtle" data-testid="order-keep-number">
              {t("keepOrderNumber")}
            </Text>
          )}
        </div>

        {/* olavka-payments: how to pay now, for an order placed through one of
            the shop's offline kinds on the manual provider. Renders nothing for
            every other order. */}
        <ManualPaymentHandover order={order} />

        <OrderSection title={td("items")}>
          <Items order={order} paid={isPaid} />
        </OrderSection>

        <OrderSection title={to("heading")}>
          <OrderSummary order={order} />
        </OrderSection>

        {shipsSomething && (
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
    </div>
  )
}
