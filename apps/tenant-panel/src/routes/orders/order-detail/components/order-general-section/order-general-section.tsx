import { XCircle } from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import {
  Container,
  Copy,
  Heading,
  StatusBadge,
  Text,
} from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { ActionMenu } from "../../../../../components/common/action-menu"
import { useDate } from "../../../../../hooks/use-date"
import {
  getCanceledOrderStatus,
  getOrderFulfillmentStatus,
  getOrderPaymentStatus,
  isOrderWithoutParcel,
  manualPaymentStatus,
} from "../../../../../lib/order-helpers"
import { ExtendedOrder } from "../../constants"
import { useCancelOrderPrompt } from "../../hooks/use-cancel-order-prompt"

type OrderGeneralSectionProps = {
  order: ExtendedOrder
}

export const OrderGeneralSection = ({ order }: OrderGeneralSectionProps) => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()
  const handleCancel = useCancelOrderPrompt(order)

  return (
    <Container className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-4">
      <div>
        <div className="flex items-center gap-x-1">
          <Heading>#{order.display_id}</Heading>
          <Copy content={`#${order.display_id}`} className="text-ui-fg-muted" />
        </div>
        <Text size="small" className="text-ui-fg-subtle">
          {t("orders.onDateFromSalesChannel", {
            date: getFullDate({ date: order.created_at, includeTime: true }),
            salesChannel: order.sales_channel?.name,
          })}
        </Text>
      </div>
      <div className="flex min-w-0 items-center gap-x-4 max-md:w-full max-md:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <OrderBadge order={order} />
          <PaymentBadge order={order} />
          <FulfillmentBadge order={order} />
        </div>
        <ActionMenu
          groups={[
            {
              actions: [
                {
                  label: t("actions.cancel"),
                  onClick: handleCancel,
                  disabled: !!order.canceled_at,
                  icon: <XCircle />,
                },
              ],
            },
          ]}
        />
      </div>
    </Container>
  )
}

const FulfillmentBadge = ({ order }: { order: HttpTypes.AdminOrder }) => {
  const { t } = useTranslation()

  // «Отменен» next to «Ждёт сборки» asks her to pack a cancelled order.
  // The same with a cancelled payment: «Оплата отменена» and «Ждёт сборки»
  // side by side say «no money» and «pack it» at once (Gemini critique 2, 3.2).
  if (
    (order.status === "canceled" || order.payment_status === "canceled") &&
    order.fulfillment_status === "not_fulfilled"
  ) {
    return null
  }

  // t-cherk-com-hotfix batch 5: an order of online courses only has nothing
  // to pack, so «Ждёт сборки» would ask her to pack air.
  if (isOrderWithoutParcel(order)) {
    return (
      <StatusBadge color="grey" className="text-nowrap">
        {t("orders.fulfillment.notNeeded")}
      </StatusBadge>
    )
  }

  const { label, color } = getOrderFulfillmentStatus(
    t,
    order.fulfillment_status
  )

  return (
    <StatusBadge color={color} className="text-nowrap">
      {label}
    </StatusBadge>
  )
}

const PaymentBadge = ({ order }: { order: HttpTypes.AdminOrder }) => {
  const { t } = useTranslation()

  const { label, color } = manualPaymentStatus(t, order) ?? getOrderPaymentStatus(t, order.payment_status)

  return (
    <StatusBadge color={color} className="text-nowrap">
      {label}
    </StatusBadge>
  )
}

const OrderBadge = ({ order }: { order: HttpTypes.AdminOrder }) => {
  const { t } = useTranslation()
  const orderStatus = getCanceledOrderStatus(t, order.status)

  if (!orderStatus) {
    return null
  }

  return (
    <StatusBadge color={orderStatus.color} className="text-nowrap">
      {orderStatus.label}
    </StatusBadge>
  )
}
