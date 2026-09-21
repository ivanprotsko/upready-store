import { useTranslation } from "react-i18next"

import { FulfillmentStatus } from "@medusajs/types"

import { getOrderFulfillmentStatus } from "../../../../../lib/order-helpers"
import { StatusCell } from "../../common/status-cell"

type FulfillmentStatusCellProps = {
  status: FulfillmentStatus
  /** The order itself is cancelled: nothing of it waits for packing. */
  orderCanceled?: boolean
}

export const FulfillmentStatusCell = ({
  status,
  orderCanceled,
}: FulfillmentStatusCellProps) => {
  const { t } = useTranslation()

  // o21-owner-panel-ux: a cancelled order read «Ждёт сборки» in the list.
  if (orderCanceled && status === "not_fulfilled") {
    return <StatusCell color="grey">{t("orders.fulfillment.notNeeded")}</StatusCell>
  }

  if (!status) {
    // TODO: remove this once fulfillment<>order link is added
    return "-"
  }

  const { label, color } = getOrderFulfillmentStatus(t, status)

  return <StatusCell color={color}>{label}</StatusCell>
}

export const FulfillmentStatusHeader = () => {
  const { t } = useTranslation()

  return (
    <div className="flex h-full w-full items-center">
      <span className="truncate">{t("fields.fulfillment")}</span>
    </div>
  )
}
