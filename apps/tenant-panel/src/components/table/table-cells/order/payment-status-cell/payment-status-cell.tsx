import { HttpTypes } from "@medusajs/types"
import { useTranslation } from "react-i18next"
import { getOrderPaymentStatus, manualPaymentStatus } from "../../../../../lib/order-helpers"
import { StatusCell } from "../../common/status-cell"

type PaymentStatusCellProps = {
  status: HttpTypes.AdminOrder["payment_status"]
  metadata?: Record<string, unknown> | null
}

export const PaymentStatusCell = ({ status, metadata }: PaymentStatusCellProps) => {
  const { t } = useTranslation()

  const { label, color } =
    manualPaymentStatus(t, { payment_status: status, metadata }) ?? getOrderPaymentStatus(t, status)

  return <StatusCell color={color}>{label}</StatusCell>
}

export const PaymentStatusHeader = () => {
  const { t } = useTranslation()

  return (
    <div className="flex h-full w-full items-center">
      <span className="truncate">{t("fields.payment")}</span>
    </div>
  )
}
