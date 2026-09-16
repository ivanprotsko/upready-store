import { useTranslation } from "react-i18next"

import type { WbFbsOrder } from "../../../../hooks/api/wb-fbs-orders"

/**
 * The two statuses an FBS order has, in the owner's words on top of WB's own
 * token (w23-wb-write-fbs-orders).
 *
 * `supplierStatus` is the one the seller moves ("new", "confirm", "complete",
 * "cancel"); `wbStatus` is what Wildberries does with it afterwards. Both are
 * shown, because they disagree often enough to matter: an order can be
 * `new` for us and already `declined_by_client` on their side, and only the
 * second explains why nothing will come of it (measured 2026-09-16: 173 such
 * orders in this cabinet).
 */
export const WbFbsStatusCell = ({ order }: { order: WbFbsOrder }) => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col">
      <span>
        {t(`wildberries.fbs.supplierStatuses.${order.supplier_status}`, {
          defaultValue: order.supplier_status ?? "—",
        })}
      </span>
      <span className="text-ui-fg-subtle">
        {t(`wildberries.fbs.wbStatuses.${order.wb_status}`, {
          defaultValue: order.wb_status ?? "—",
        })}
      </span>
    </div>
  )
}
