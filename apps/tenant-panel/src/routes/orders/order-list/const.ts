export const DEFAULT_PROPERTIES = [
  "id",
  "status",
  "created_at",
  "email",
  "display_id",
  "custom_display_id",
  "payment_status",
  "fulfillment_status",
  "total",
  "currency_code",
  // t-cherk-com-hotfix batch 5: tells an order of online courses only
  // (`isOrderWithoutParcel`) from one that waits for packing.
  "items.requires_shipping",
  // t-cherk-com-hotfix batch 6: `metadata.payment_receipt` drives the
  // manual-provider payment status (`manualPaymentStatus`).
  "metadata",
  // t-2026-10-14-58, step C: the «Статус» column (`orderStage`) reads where
  // each parcel is — its dates and the carrier status kept in `data`.
  "fulfillments.packed_at",
  "fulfillments.shipped_at",
  "fulfillments.delivered_at",
  "fulfillments.canceled_at",
  "fulfillments.data",
]

export const DEFAULT_RELATIONS = [
  "*customer",
  "*sales_channel",
  "*payment_collections",
  // t-cherk-com-hotfix batch 6: `manualPaymentStatus` needs this to tell a
  // manual-provider order (olavka-payments) from a Robokassa one.
  "payment_collections.payments.provider_id",
  // t-2026-10-14-58, step C: a Robokassa order still waiting for Robokassa's
  // confirmation has only its session (`orderStage` → «Ожидает подтверждения оплаты»).
  "payment_collections.payments.canceled_at",
  "payment_collections.payment_sessions.provider_id",
  "payment_collections.payment_sessions.status",
]

export const DEFAULT_FIELDS = `${DEFAULT_PROPERTIES.join(
  ","
)},${DEFAULT_RELATIONS.join(",")}`
