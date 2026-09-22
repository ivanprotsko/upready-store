import { Container } from "@medusajs/ui"

import { isManual, isStripeLike, paymentInfoMap } from "@lib/constants"
import { readManualPaymentKind } from "@lib/tenant/manual-payment"
import { paymentMethodName } from "@lib/util/payment"
import { formatDateTime } from "@lib/util/date"
import { convertToLocale } from "@lib/util/money"
import type { HttpTypes } from "@medusajs/types"
import { OrderDetailColumn } from "@modules/order/components/order-section"
import { getLocale, getTranslations } from "next-intl/server"

type PaymentDetailsProps = {
  order: HttpTypes.StoreOrder
}

const PaymentDetails = async ({ order }: PaymentDetailsProps) => {
  const [t, tm, tmp, locale] = await Promise.all([
    getTranslations("PaymentDetails"),
    getTranslations("PaymentMethods"),
    getTranslations("ManualPayment"),
    getLocale(),
  ])
  const payment = order.payment_collections?.[0]?.payments?.[0]

  if (!payment) {
    return null
  }

  const card = isStripeLike(payment.provider_id) && payment.data?.card_last4

  // olavka-payments: an order placed through one of the shop's offline kinds
  // on the manual provider carries the kind in its metadata (stamped on the
  // cart at checkout). Such an order has not been paid on the storefront, so
  // the column says which offline kind was chosen and «awaiting payment»
  // instead of an amount «paid at» a date — until the owner captures it in the
  // panel, after which the usual line applies.
  const manualKind = isManual(payment.provider_id)
    ? readManualPaymentKind(
        order.metadata as Record<string, unknown> | null | undefined
      )
    : null
  const awaitingManualPayment =
    manualKind !== null && order.payment_status !== "captured"

  return (
    <div className="grid grid-cols-1 small:grid-cols-3 gap-6">
      <OrderDetailColumn label={t("paymentMethod")}>
        <span data-testid="payment-method">
          {manualKind
            ? tmp(manualKind === "crypto" ? "methodCrypto" : "methodOther")
            : paymentMethodName(tm, payment.provider_id)}
        </span>
      </OrderDetailColumn>

      <OrderDetailColumn label={t("paymentDetails")}>
        <div className="flex gap-x-2 items-center">
          <Container className="flex items-center h-7 w-fit p-2 bg-ui-button-neutral-hover">
            {paymentInfoMap[payment.provider_id]?.icon}
          </Container>
          <span data-testid="payment-amount">
            {card
              ? `**** **** **** ${payment.data?.card_last4}`
              : awaitingManualPayment
                ? `${convertToLocale({
                    amount: payment.amount,
                    currency_code: order.currency_code,
                    locale,
                  })} — ${tmp("awaitingPayment")}`
                : `${convertToLocale({
                    amount: payment.amount,
                    currency_code: order.currency_code,
                    locale,
                  })} ${t("paidAt")} ${formatDateTime({
                    date: payment.created_at ?? "",
                    locale,
                  })}`}
          </span>
        </div>
      </OrderDetailColumn>
    </div>
  )
}

export default PaymentDetails
