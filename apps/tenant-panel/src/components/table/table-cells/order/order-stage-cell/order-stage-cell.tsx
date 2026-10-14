import { useTranslation } from "react-i18next"

import {
  ORDER_STAGE_COLORS,
  orderStage,
  orderStageKey,
  type StageOrder,
} from "../../../../../lib/order-stage"
import { StatusCell } from "../../common/status-cell"

type OrderStageCellProps = {
  order: StageOrder
}

/**
 * t-2026-10-14-58, step C: the order's one stage in the list, the same word the
 * buyer reads on the storefront («Собирается», «Ожидает отправки», «В пути»).
 * It replaces the «Сборка» column, whose Medusa statuses («Ждёт сборки»,
 * «Собран») said nothing past the packing table; «Оплата» keeps its column.
 */
export const OrderStageCell = ({ order }: OrderStageCellProps) => {
  const { t } = useTranslation()
  const stage = orderStage(order)

  return (
    <div className="contents" data-testid="order-stage" data-value={stage}>
      <StatusCell color={ORDER_STAGE_COLORS[stage]}>{t(orderStageKey(stage))}</StatusCell>
    </div>
  )
}

export const OrderStageHeader = () => {
  const { t } = useTranslation()

  return (
    <div className="flex h-full w-full items-center">
      <span className="truncate">{t("fields.status")}</span>
    </div>
  )
}
