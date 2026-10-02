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
]

export const DEFAULT_RELATIONS = [
  "*customer",
  "*sales_channel",
  "*payment_collections",
]

export const DEFAULT_FIELDS = `${DEFAULT_PROPERTIES.join(
  ","
)},${DEFAULT_RELATIONS.join(",")}`
