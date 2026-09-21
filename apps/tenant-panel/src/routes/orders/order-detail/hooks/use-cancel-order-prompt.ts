import { HttpTypes } from "@medusajs/types"
import { toast, usePrompt } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useCancelOrder } from "../../../../hooks/api/orders"

/**
 * «Отменить заказ» with its «are you sure» (o21-owner-panel-ux): one
 * confirmation for the menu next to the order's number and for the next-step
 * card of an order whose payment was cancelled.
 */
export const useCancelOrderPrompt = (order: Pick<HttpTypes.AdminOrder, "id" | "display_id">) => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const { mutateAsync: cancelOrder } = useCancelOrder(order.id)

  return async () => {
    const res = await prompt({
      title: t("general.areYouSure"),
      description: t("orders.cancelWarning", {
        id: `#${order.display_id}` as string,
      }),
      confirmText: t("actions.continue"),
      cancelText: t("actions.cancel"),
    })

    if (!res) {
      return
    }

    await cancelOrder(undefined, {
      onSuccess: () => {
        toast.success(t("orders.orderCanceled"))
      },
      onError: (e) => {
        toast.error(e.message)
      },
    })
  }
}
