import { Button, Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { HttpTypes } from "@medusajs/types"

type NextStep = { key: "pack" | "ship" | "waitDelivery" | "done" | "canceled"; to?: string }

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

  const toPack = (order.items ?? []).filter(
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
  const toHandOver = step.key === "pack" || step.key === "ship"
  // Lead review of the walk: a cancelled payment is not «not yet»: nobody is
  // going to pay for this parcel, so the card says that instead of «Собрать»,
  // and the step stays as a quiet button for the order she was paid for in hand.
  const paymentCanceled = toHandOver && order.payment_status === "canceled"
  const textKey = paymentCanceled ? "paymentCanceled" : step.key
  // Lead review H8: she must not pack a parcel believing it is paid for.
  const unpaid =
    toHandOver &&
    !paymentCanceled &&
    !["captured", "partially_captured", "refunded", "partially_refunded"].includes(
      order.payment_status
    )

  return (
    <Container
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4"
      data-testid="order-next-step"
    >
      <div className="flex min-w-0 flex-col">
        <Heading
          level="h2"
          className={paymentCanceled ? "text-ui-tag-red-text" : undefined}
          data-testid={paymentCanceled ? "order-next-step-payment-canceled" : undefined}
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
      {step.to ? (
        <Button
          variant={paymentCanceled ? "secondary" : "primary"}
          className="max-md:min-h-11 max-md:w-full"
          asChild
        >
          <Link to={step.to} data-testid={`order-next-step-${step.key}`}>
            {t(`orders.nextStep.${step.key}.action`)}
          </Link>
        </Button>
      ) : null}
    </Container>
  )
}
