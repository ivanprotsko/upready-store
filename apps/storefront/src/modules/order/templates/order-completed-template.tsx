import { Heading, Text } from "@medusajs/ui"
import { cookies as nextCookies } from "next/headers"

import Help from "@modules/order/components/help"
import Items from "@modules/order/components/items"
import OnboardingCta from "@modules/order/components/onboarding-cta"
import OrderDetails from "@modules/order/components/order-details"
import OrderSection from "@modules/order/components/order-section"
import OrderSummary from "@modules/order/components/order-summary"
import PaymentDetails from "@modules/order/components/payment-details"
import ShippingDetails from "@modules/order/components/shipping-details"
import PurchaseEvent from "@modules/common/components/purchase-event"
import { getTenantAnalytics } from "@lib/data/analytics"
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
        <div className="flex flex-col gap-y-3">
          <Heading level="h1" className="text-2xl-semi text-ui-fg-base">
            {t("thankYou")}
          </Heading>
          <Text className="txt-medium text-ui-fg-subtle">
            {t("orderSuccess")}
          </Text>
          <OrderDetails order={order} locale={locale} showStatus />
          <Text
            className="txt-medium text-ui-fg-subtle"
            data-testid="order-keep-number"
          >
            {t("keepOrderNumber")}
          </Text>
        </div>

        <OrderSection title={td("items")}>
          <Items order={order} />
        </OrderSection>

        <OrderSection title={to("heading")}>
          <OrderSummary order={order} />
        </OrderSection>

        <OrderSection title={ts("heading")}>
          <ShippingDetails order={order} />
        </OrderSection>

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
