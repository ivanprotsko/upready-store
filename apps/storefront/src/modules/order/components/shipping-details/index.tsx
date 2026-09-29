import { formatAddressLines, joinFilled } from "@lib/util/address"
import { convertToLocale } from "@lib/util/money"
import { trackingLines } from "@lib/util/order-tracking"
import { PICKUP_METADATA_KEYS } from "@lib/theme/composition"
import { pochtaPointOf } from "@lib/util/pochta"
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

  // The tracking number(s) the shop owner typed on the shipment, carrier first
  // («СДЭК 1234567890»), assembled the same way as in the account timeline
  // (`@lib/util/order-tracking`).
  const tracking = trackingLines(order.fulfillments)

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

  // A Russian Post pickup point lives on the shipping method's `data`, written
  // by the provider from the carrier's directory (46df-pochta).
  const tPochta = await getTranslations("PochtaPoint")
  const pochtaPoint = pochtaPointOf(order)

  const addressLines = pochtaPoint
    ? [
        pochtaPoint.pochta_point_address,
        joinFilled([pochtaPoint.pochta_point_city, pochtaPoint.pochta_point_region], ", "),
        tPochta("postcode", { index: pochtaPoint.pochta_point_index }),
        pochtaPoint.pochta_point_name,
      ].filter((line): line is string => Boolean(line))
    : isPickupOrder
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
        label={
          pochtaPoint
            ? tPochta("heading")
            : isPickupOrder
            ? tPickup("label")
            : t("shippingAddress")
        }
        data-testid={
          pochtaPoint
            ? "pochta-point-summary"
            : isPickupOrder
            ? "pickup-point-summary"
            : "shipping-address-summary"
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

      {tracking.length > 0 && (
        <OrderDetailColumn
          label={tTimeline("trackingNumber")}
          data-testid="order-tracking"
        >
          {tracking.map((line) => (
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
