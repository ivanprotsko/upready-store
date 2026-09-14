import { formatAddressLines, joinFilled } from "@lib/util/address"
import { convertToLocale } from "@lib/util/money"
import { PICKUP_METADATA_KEYS } from "@lib/theme/composition"
import type { HttpTypes } from "@medusajs/types"

import { OrderDetailColumn } from "@modules/order/components/order-section"
import { getLocale, getTranslations } from "next-intl/server"

type ShippingDetailsProps = {
  order: HttpTypes.StoreOrder
}

/** A metadata value comes back as `unknown` — read it only when it is a real string. */
const readMetadataString = (
  metadata: HttpTypes.StoreOrder["metadata"],
  key: string
): string | null => {
  const value = metadata?.[key]
  return typeof value === "string" && value.length > 0 ? value : null
}

const ShippingDetails = async ({ order }: ShippingDetailsProps) => {
  const t = await getTranslations("ShippingDetails")
  // `PickupPoint.label` is the one namespace for pickup-point copy (critique
  // resolution 2.8: `ShippingDetails.pickupPoint` was dropped in its favor,
  // shared with the pickup-point sheet's own display copy).
  const tPickup = await getTranslations("PickupPoint")
  // `OrderTimeline.trackingNumber` is the one key for the tracking label; the
  // account timeline (pickup orders) and this section (shipped orders) share it.
  const tTimeline = await getTranslations("OrderTimeline")
  const locale = await getLocale()

  // t04-shipping-tariffs: the tracking number(s) the shop owner typed on the
  // shipment, carrier first («СДЭК 1234567890»), read from
  // `fulfillments.labels` + `fulfillments.metadata.carrier` (lib/data/orders.ts).
  type TrackedFulfillment = {
    labels?: { tracking_number?: string | null }[] | null
    metadata?: Record<string, unknown> | null
  }
  const trackingLines = ((order.fulfillments ?? []) as TrackedFulfillment[]).flatMap(
    (fulfillment) => {
      const carrierRaw = fulfillment.metadata?.carrier
      const carrier =
        typeof carrierRaw === "string" && carrierRaw.trim() ? carrierRaw.trim() : null
      return (fulfillment.labels ?? [])
        .map((label) => label.tracking_number?.trim())
        .filter((number): number is string => Boolean(number))
        .map((number) => (carrier ? `${carrier} ${number}` : number))
    }
  )

  // `cart.metadata` is copied onto `order.metadata` verbatim by
  // `completeCartWorkflow` (composition.ts's own PICKUP_METADATA_KEYS doc
  // comment, probe 1) — one metadata key set carries a chosen pickup point
  // all the way from the checkout to this page, no translation layer.
  const pickupPointName = readMetadataString(
    order.metadata,
    PICKUP_METADATA_KEYS.name
  )
  const pickupPointAddress = readMetadataString(
    order.metadata,
    PICKUP_METADATA_KEYS.address
  )
  const pickupPointHours = readMetadataString(
    order.metadata,
    PICKUP_METADATA_KEYS.hours
  )
  const isPickupOrder = Boolean(pickupPointName)

  const addressLines = isPickupOrder
    ? [pickupPointName, pickupPointAddress, pickupPointHours].filter(
        (line): line is string => Boolean(line)
      )
    : formatAddressLines(order.shipping_address)
  const contactLines = [order.shipping_address?.phone, order.email].filter(
    Boolean
  ) as string[]

  const shippingMethod = order.shipping_methods?.[0] as
    | { name?: string; total?: number }
    | undefined
  const shippingMethodLabel = shippingMethod
    ? joinFilled(
        [
          shippingMethod.name,
          convertToLocale({
            amount: shippingMethod.total ?? 0,
            currency_code: order.currency_code,
            locale,
          }),
        ],
        " · "
      )
    : ""

  return (
    <div className="grid grid-cols-1 small:grid-cols-3 gap-6">
      <OrderDetailColumn
        label={isPickupOrder ? tPickup("label") : t("shippingAddress")}
        data-testid={
          isPickupOrder ? "pickup-point-summary" : "shipping-address-summary"
        }
      >
        {addressLines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </OrderDetailColumn>

      <OrderDetailColumn
        label={t("contact")}
        data-testid="shipping-contact-summary"
      >
        {contactLines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </OrderDetailColumn>

      <OrderDetailColumn
        label={t("method")}
        data-testid="shipping-method-summary"
      >
        <span>{shippingMethodLabel}</span>
      </OrderDetailColumn>

      {trackingLines.length > 0 && (
        <OrderDetailColumn
          label={tTimeline("trackingNumber")}
          data-testid="order-tracking"
        >
          {trackingLines.map((line) => (
            <span key={line} className="tabular-nums" data-testid="order-tracking-number">
              {line}
            </span>
          ))}
        </OrderDetailColumn>
      )}
    </div>
  )
}

export default ShippingDetails
