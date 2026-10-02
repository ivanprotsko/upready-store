import { Button, Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { HttpTypes } from "@medusajs/types"

import { isParcelLine } from "../../../../../lib/order-helpers"
import { useCancelOrderPrompt } from "../../hooks/use-cancel-order-prompt"

type NextStep = {
  key:
    | "pack"
    | "ship"
    | "waitDelivery"
    | "done"
    | "canceled"
    | "digitalAwaitingPayment"
    | "digitalDone"
    | "digitalPaymentCanceled"
  to?: string
}

const PAID_STATUSES = ["captured", "partially_captured", "refunded", "partially_refunded"]

/**
 * The one thing to do with this order now (o21-owner-panel-ux, P5). The copied
 * dashboard keeps «Собрать» and «Отметить как отправленный» inside three-dot
 * menus further down the screen; the owner opens an order to move it on, so the
 * next step is the first thing she sees, as one primary button.
 */
const nextStepOf = (order: HttpTypes.AdminOrder): NextStep => {
  if (order.status === "canceled") {
    return { key: "canceled" }
  }

  // t-cherk-com-hotfix batch 5: a line sold without delivery (an online
  // course) is never packed. An order of only such lines is done once paid;
  // a mixed order goes through packing for its parcel lines alone.
  const parcelLines = (order.items ?? []).filter(isParcelLine)
  if (order.items?.length && !parcelLines.length) {
    if (order.payment_status === "canceled") {
      return { key: "digitalPaymentCanceled" }
    }
    return {
      key: PAID_STATUSES.includes(order.payment_status)
        ? "digitalDone"
        : "digitalAwaitingPayment",
    }
  }

  const toPack = parcelLines.filter(
    (item) => (item.detail?.fulfilled_quantity ?? 0) < item.quantity
  )
  if (toPack.length) {
    const requiresShipping = toPack.some((item) => item.requires_shipping)
    return {
      key: "pack",
      to: `/orders/${order.id}/fulfillment?requires_shipping=${requiresShipping}`,
    }
  }

  const live = (order.fulfillments ?? []).filter((f) => !f.canceled_at)
  const toShip = live.find((f) => f.requires_shipping && !f.shipped_at && !f.delivered_at)
  if (toShip) {
    return { key: "ship", to: `/orders/${order.id}/${toShip.id}/create-shipment` }
  }
  if (live.some((f) => !f.delivered_at)) {
    return { key: "waitDelivery" }
  }
  return { key: "done" }
}

export const OrderNextStep = ({ order }: { order: HttpTypes.AdminOrder }) => {
  const { t } = useTranslation()
  const step = nextStepOf(order)
  const cancelOrder = useCancelOrderPrompt(order)
  const toHandOver = step.key === "pack" || step.key === "ship"
  // Lead review of the walk: a cancelled payment is not «not yet»: nobody is
  // going to pay for this parcel, so the card says that instead of «Собрать».
  // Its own button is «Отменить заказ»; the step stays as a text link for the
  // order she was paid for in hand (Gemini critique 2, 3.1 and 3.3).
  const paymentCanceled = toHandOver && order.payment_status === "canceled"
  const textKey = paymentCanceled ? "paymentCanceled" : step.key
  // A course order with its payment cancelled: no parcel to hand over anyway,
  // so the card offers only «Отменить заказ».
  const digitalCanceled = step.key === "digitalPaymentCanceled"
  // Lead review H8: she must not pack a parcel believing it is paid for.
  const unpaid =
    toHandOver &&
    !paymentCanceled &&
    !PAID_STATUSES.includes(order.payment_status)

  return (
    <Container
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4"
      data-testid="order-next-step"
    >
      <div className="flex min-w-0 flex-col">
        <Heading
          level="h2"
          className={paymentCanceled || digitalCanceled ? "text-ui-tag-red-text" : undefined}
          data-testid={
            paymentCanceled || digitalCanceled ? "order-next-step-payment-canceled" : undefined
          }
        >
          {t(`orders.nextStep.${textKey}.title`)}
        </Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t(`orders.nextStep.${textKey}.hint`)}
        </Text>
        {unpaid ? (
          <Text
            size="small"
            weight="plus"
            className="text-ui-tag-orange-text"
            data-testid="order-next-step-unpaid"
          >
            {t("orders.nextStep.unpaid")}
          </Text>
        ) : null}
      </div>
      {digitalCanceled ? (
        <Button
          variant="secondary"
          type="button"
          className="max-md:min-h-11 max-md:w-full"
          onClick={cancelOrder}
          data-testid="order-next-step-cancel-order"
        >
          {t("orders.nextStep.paymentCanceled.cancelOrder")}
        </Button>
      ) : step.to && paymentCanceled ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 max-md:w-full">
          <Button
            variant="secondary"
            type="button"
            className="max-md:min-h-11 max-md:w-full"
            onClick={cancelOrder}
            data-testid="order-next-step-cancel-order"
          >
            {t("orders.nextStep.paymentCanceled.cancelOrder")}
          </Button>
          <Link
            to={step.to}
            className="txt-compact-small-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover max-md:flex max-md:min-h-11 max-md:w-full max-md:items-center max-md:justify-center"
            data-testid={`order-next-step-${step.key}`}
          >
            {t(`orders.nextStep.paymentCanceled.${step.key}Anyway`)}
          </Link>
        </div>
      ) : step.to ? (
        <Button variant="primary" className="max-md:min-h-11 max-md:w-full" asChild>
          <Link to={step.to} data-testid={`order-next-step-${step.key}`}>
            {t(`orders.nextStep.${step.key}.action`)}
          </Link>
        </Button>
      ) : null}
    </Container>
  )
}
