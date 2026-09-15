/**
 * The order statuses this storefront knows how to show a customer, and the
 * colour each one is drawn in.
 *
 * They live here rather than inside the component that renders them so a test
 * can hold them against the message catalogs: a status with a colour but no
 * translation reaches the screen as its raw enum («shipped», «not_fulfilled»),
 * which is the one thing the order screens must never show.
 */

export type StatusTone =
  | "green"
  | "red"
  | "orange"
  | "blue"
  | "purple"
  | "neutral"

/**
 * Mirrors how the Medusa Admin colors the same statuses (`order-status/index.tsx`'s
 * own comment), so a shop owner reads an order the same way on both sides: neutral
 * for nothing done yet, orange for part way through, blue for on its way, green for
 * finished and red for something that needs attention.
 */
export const FULFILLMENT_TONES: Record<string, StatusTone> = {
  canceled: "red",
  delivered: "green",
  fulfilled: "blue",
  not_fulfilled: "neutral",
  partially_delivered: "orange",
  partially_fulfilled: "orange",
  partially_shipped: "orange",
  shipped: "blue",
}

export const PAYMENT_TONES: Record<string, StatusTone> = {
  authorized: "orange",
  awaiting: "orange",
  canceled: "red",
  captured: "green",
  not_paid: "neutral",
  partially_authorized: "orange",
  partially_captured: "orange",
  partially_refunded: "orange",
  refunded: "neutral",
  requires_action: "red",
}
