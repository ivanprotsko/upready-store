import type { TFunction } from "i18next"

import { formatProvider } from "./format-provider.ts"

export const getCanceledOrderStatus = (
  t: TFunction<"translation">,
  status: string
): { label: string; color: "red" } | null => {
  if (status === "canceled") {
    return { label: t("orders.status.canceled"), color: "red" }
  }

  return null
}

export const getOrderPaymentStatus = (
  t: TFunction<"translation">,
  status: string
) => {
  const [label, color] = {
    not_paid: [t("orders.payment.status.notPaid"), "red"],
    authorized: [t("orders.payment.status.authorized"), "orange"],
    partially_authorized: [
      t("orders.payment.status.partiallyAuthorized"),
      "red",
    ],
    awaiting: [t("orders.payment.status.awaiting"), "orange"],
    captured: [t("orders.payment.status.captured"), "green"],
    refunded: [t("orders.payment.status.refunded"), "red"],
    partially_refunded: [
      t("orders.payment.status.partiallyRefunded"),
      "orange",
    ],
    partially_captured: [
      t("orders.payment.status.partiallyCaptured"),
      "orange",
    ],
    canceled: [t("orders.payment.status.canceled"), "red"],
    requires_action: [t("orders.payment.status.requiresAction"), "orange"],
  }[status] as [string, "red" | "orange" | "green"]

  return { label, color }
}

export const getOrderFulfillmentStatus = (
  t: TFunction<"translation">,
  status: string
) => {
  const [label, color] = {
    // Blue «in progress», not red (U-16, 46df): an order waiting to be packed
    // is ordinary work, and red is kept for what went wrong.
    not_fulfilled: [t("orders.fulfillment.status.notFulfilled"), "blue"],
    partially_fulfilled: [
      t("orders.fulfillment.status.partiallyFulfilled"),
      "orange",
    ],
    fulfilled: [t("orders.fulfillment.status.fulfilled"), "green"],
    partially_shipped: [
      t("orders.fulfillment.status.partiallyShipped"),
      "orange",
    ],
    shipped: [t("orders.fulfillment.status.shipped"), "green"],
    delivered: [t("orders.fulfillment.status.delivered"), "green"],
    partially_delivered: [
      t("orders.fulfillment.status.partiallyDelivered"),
      "orange",
    ],
    partially_returned: [
      t("orders.fulfillment.status.partiallyReturned"),
      "orange",
    ],
    returned: [t("orders.fulfillment.status.returned"), "green"],
    canceled: [t("orders.fulfillment.status.canceled"), "red"],
    requires_action: [t("orders.fulfillment.status.requiresAction"), "orange"],
  }[status] as [string, "red" | "orange" | "green" | "blue"]

  return { label, color }
}

/**
 * Payment `provider_id` values are internal identifiers (`pp_system_default`,
 * `pp_robokassa_robokassa`), never meant for a shop owner's screen. The
 * manual provider gets its own label; anything else falls back to the
 * provider's own segment of the id via `formatProvider`, since the tenant
 * contract carries no separate display name for a payment provider.
 */
export const getPaymentProviderLabel = (
  t: TFunction<"translation">,
  providerId?: string | null
): string => {
  if (!providerId) {
    return t("orders.payment.provider.unknown")
  }

  if (providerId === "pp_system_default") {
    return t("orders.payment.provider.manual")
  }

  if (providerId.startsWith("pp_robokassa_")) {
    return t("orders.payment.provider.robokassa")
  }

  return formatProvider(providerId)
}

/**
 * A fulfillment's `provider_id` is an internal identifier too
 * (`manual_manual` for a shop that packs and posts parcels itself), and
 * `formatProvider` turned it into the bare word «Manual» on the owner's order
 * card. The shop owner reads a carrier there, so the manual provider says so
 * in words and anything else keeps the provider's own segment of the id.
 */
export const getFulfillmentProviderLabel = (
  t: TFunction<"translation">,
  providerId?: string | null
): string => {
  if (!providerId) {
    return t("orders.fulfillment.provider.unknown")
  }

  if (providerId === "manual_manual") {
    return t("orders.fulfillment.provider.manual")
  }

  return formatProvider(providerId)
}

type ShippableLine = { requires_shipping?: boolean | null }

/**
 * t-cherk-com-hotfix batch 5: a line sold without delivery (an online course,
 * whose product has no shipping profile) comes with `requires_shipping: false`.
 * Nothing of it is packed or shipped; the buyer gets the course when the
 * payment is confirmed. A line whose flag was not loaded counts as a parcel.
 */
export const isParcelLine = (item: ShippableLine): boolean =>
  item.requires_shipping !== false

/**
 * An order every line of which is sold without delivery: no packing, no
 * shipping, done once paid. `false` when the items were not loaded, so an
 * order is a parcel unless its lines say otherwise.
 */
export const isOrderWithoutParcel = (order: {
  items?: ShippableLine[] | null
}): boolean =>
  !!order.items?.length && order.items.every((item) => !isParcelLine(item))

type ReceiptMeta = { status?: unknown } | null | undefined

/**
 * t-cherk-com-hotfix batch 6, item 5: the manual-provider order reads
 * «Ожидает оплаты» before a receipt and «Ожидает подтверждения оплаты» once
 * one is in, same words as the storefront. `null` means «show the plain
 * payment status», which already says «Ожидает оплаты» for an uncaptured
 * order, so a manual order with no receipt needs no override at all.
 */
export const manualPaymentStatus = (
  t: TFunction<"translation">,
  order: { payment_status: string; metadata?: Record<string, unknown> | null }
): { label: string; color: "red" | "orange" | "green" } | null => {
  const receipt = (order.metadata?.payment_receipt ?? null) as ReceiptMeta
  if (!receipt || typeof receipt !== "object") {
    return null
  }
  if (receipt.status === "rejected") {
    return { label: t("orders.payment.status.receiptRejected"), color: "red" }
  }
  if (!["captured", "partially_captured", "refunded", "partially_refunded"].includes(order.payment_status)) {
    return { label: t("orders.payment.status.awaitingConfirmation"), color: "orange" }
  }
  return null
}
