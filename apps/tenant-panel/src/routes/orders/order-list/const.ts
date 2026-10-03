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
]

export const DEFAULT_RELATIONS = [
  "*customer",
  "*sales_channel",
  "*payment_collections",
  // t-cherk-com-hotfix batch 6: `manualPaymentStatus` needs this to tell a
  // manual-provider order (olavka-payments) from a Robokassa one.
  "payment_collections.payments.provider_id",
]

export const DEFAULT_FIELDS = `${DEFAULT_PROPERTIES.join(
  ","
)},${DEFAULT_RELATIONS.join(",")}`
