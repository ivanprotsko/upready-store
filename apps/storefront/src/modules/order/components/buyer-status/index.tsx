import { StatusBadge } from "@medusajs/ui"
import { getTranslations } from "next-intl/server"

import {
  BUYER_STATUS_TONES,
  buyerOrderStatus,
  type BuyerOrderStatus,
  type BuyerStatusOrder,
} from "@lib/util/buyer-order-status"
import type { StatusTone } from "@lib/util/order-status"
import StatusDot from "@modules/account/components/status-dot"

/**
 * The buyer's one order status (batch 7) on the two surfaces that show it: the
 * order page wears it as a `StatusBadge` (the pill the page already used for
 * Medusa's raw statuses), the account as the 8 px dot the account canon draws.
 * Both read the same `buyerOrderStatus` and the same `OrderStatus.*` words, so an
 * order never says one thing on the confirmation page and another in the account.
 */

const BADGE_COLORS: Record<StatusTone, "green" | "red" | "blue" | "orange" | "grey" | "purple"> = {
  green: "green",
  red: "red",
  orange: "orange",
  blue: "blue",
  purple: "purple",
  neutral: "grey",
}

export const buyerStatusLabel = async (status: BuyerOrderStatus): Promise<string> => {
  const t = await getTranslations("OrderStatus")
  return t(status)
}

type Props = {
  order: BuyerStatusOrder
  className?: string
}

export const BuyerStatusBadge = async ({ order, className }: Props) => {
  const status = buyerOrderStatus(order)
  const label = await buyerStatusLabel(status)

  return (
    <StatusBadge
      color={BADGE_COLORS[BUYER_STATUS_TONES[status]]}
      className={className}
      data-testid="order-buyer-status"
      data-value={status}
    >
      {label}
    </StatusBadge>
  )
}

export const BuyerStatusDot = async ({ order, className }: Props) => {
  const status = buyerOrderStatus(order)
  const label = await buyerStatusLabel(status)

  return (
    <StatusDot
      tone={BUYER_STATUS_TONES[status]}
      label={label}
      className={className}
      data-testid="order-buyer-status"
      data-value={status}
    />
  )
}
