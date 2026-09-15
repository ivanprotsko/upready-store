import { TFunction } from "i18next"

import { formatProvider } from "./format-provider"

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
    not_fulfilled: [t("orders.fulfillment.status.notFulfilled"), "red"],
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
  }[status] as [string, "red" | "orange" | "green"]

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
