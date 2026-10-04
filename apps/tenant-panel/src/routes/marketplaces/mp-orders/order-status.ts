import type { OrderStatusKey } from "../../../hooks/api/marketplace-orders"

/**
 * The colour of the status dot and badge, by the common key the backend
 * computes from the marketplace's own words (`order-status.ts`). Shared by the
 * list and the card so one order reads the same on both.
 */
export const ORDER_STATUS_COLOR: Record<
  OrderStatusKey,
  "green" | "red" | "blue" | "orange" | "grey" | "purple"
> = {
  new: "blue",
  processing: "orange",
  shipped: "purple",
  delivered: "green",
  cancelled: "red",
  returned: "red",
  unspecified: "grey",
  other: "grey",
}

/** The marketplace's own words, as it sent them: «complete · sold». */
export const rawStatusOf = (status: string | null, detail: string | null): string | null =>
  [status, detail].filter(Boolean).join(" · ") || null
