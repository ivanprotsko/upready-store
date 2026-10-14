import { XCircle } from "@medusajs/icons"
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
import { getOrderPaymentStatus, manualPaymentStatus } from "../../../../../lib/order-helpers"
import {
  ORDER_STAGE_COLORS,
  orderStage,
  orderStageKey,
  type OrderStage,
  paymentRepeatsStage,
  type StageOrder,
} from "../../../../../lib/order-stage"
import { ExtendedOrder } from "../../constants"
import { useCancelOrderPrompt } from "../../hooks/use-cancel-order-prompt"

type OrderGeneralSectionProps = {
  order: ExtendedOrder
}

export const OrderGeneralSection = ({ order }: OrderGeneralSectionProps) => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()
  const handleCancel = useCancelOrderPrompt(order)

  // t-2026-10-14-58 (release stand, 14.10): one badge when the payment would
  // say the stage's own words; the «Оплата» block below keeps its badge.
  const stage = orderStage(order as unknown as StageOrder)
  const payment = manualPaymentStatus(t, order) ?? getOrderPaymentStatus(t, order.payment_status)
  const showPayment = !paymentRepeatsStage(t(orderStageKey(stage)), payment.label)

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
          <StageBadge stage={stage} />
          {showPayment && <PaymentBadge payment={payment} />}
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

/**
 * t-2026-10-14-58, step C: the order's one stage, the word the buyer reads on
 * the storefront. It replaces two badges: «Отменён» (a stage of its own now)
 * and the fulfillment one, whose «Ждёт сборки» next to «Отменён» or «Оплата
 * отменена» asked her to pack an order nobody pays for (Gemini critique 2, 3.2).
 */
const StageBadge = ({ stage }: { stage: OrderStage }) => {
  const { t } = useTranslation()

  return (
    <StatusBadge
      color={ORDER_STAGE_COLORS[stage]}
      className="text-nowrap"
      data-testid="order-stage"
      data-value={stage}
    >
      {t(orderStageKey(stage))}
    </StatusBadge>
  )
}

const PaymentBadge = ({ payment }: { payment: ReturnType<typeof getOrderPaymentStatus> }) => (
  <StatusBadge color={payment.color} className="text-nowrap">
    {payment.label}
  </StatusBadge>
)
