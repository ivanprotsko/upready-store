import type { HttpTypes } from "@medusajs/types"

import { buyerOrderStatus, type BuyerOrderStatus } from "./buyer-order-status"
import { isNoDeliveryLine } from "./shipping-address"

/**
 * «Мои курсы» for a course that is bought but not paid yet (batch 7, Ivan 03.10:
 * «Курс тоже появляется в личном кабинете но без доступа»). The courses endpoint
 * lists live entitlements only, so the pending ones are read off the customer's
 * own orders: every no-delivery line (`isNoDeliveryLine`, the course rule of
 * hotfix Plan B) of an order that is neither paid nor cancelled. One card per
 * product, the newest order first; a product the customer already holds access
 * to is left out, whatever older unpaid order still names it.
 */
export type PendingCourse = {
  productId: string
  title: string
  handle: string | null
  thumbnail: string | null
  orderId: string
  orderDisplayId: number | string
  status: Exclude<BuyerOrderStatus, "paid" | "canceled" | "refunded">
}

type PendingOrder = Pick<HttpTypes.StoreOrder, "id" | "display_id" | "status" | "payment_status" | "items"> & {
  metadata?: Record<string, unknown> | null
}

export const pendingCoursesFromOrders = (
  orders: PendingOrder[],
  ownedProductIds: readonly string[]
): PendingCourse[] => {
  const seen: Record<string, true> = {}
  for (const id of ownedProductIds) {
    seen[id] = true
  }
  const out: PendingCourse[] = []

  for (const order of orders) {
    const status = buyerOrderStatus(order)
    if (status === "paid" || status === "canceled" || status === "refunded") {
      continue
    }
    for (const item of order.items ?? []) {
      if (!isNoDeliveryLine(item)) {
        continue
      }
      const productId = item.product_id ?? item.product?.id ?? null
      if (!productId || seen[productId]) {
        continue
      }
      seen[productId] = true
      out.push({
        productId,
        title: item.product_title ?? item.title ?? "",
        handle: item.product_handle ?? item.product?.handle ?? null,
        thumbnail: item.thumbnail ?? null,
        orderId: order.id,
        orderDisplayId: order.display_id ?? order.id,
        status,
      })
    }
  }

  return out
}
