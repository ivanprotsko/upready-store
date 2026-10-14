import { getSitePromoCodeEnabled } from "@lib/data/tenant-promo-code"
import { PICKUP_METADATA_KEYS } from "@lib/theme/composition"
import type { HttpTypes } from "@medusajs/types"
import { Divider, Text } from "@medusajs/ui"
import { getTranslations } from "next-intl/server"
import { apishipMethodOf, apishipPointLine } from "@lib/util/apiship"
import { chosenCdekPoint, cdekTermOf } from "@lib/util/cdek"
import { pochtaPointOf } from "@lib/util/pochta"
import { cartNeedsShipping, isNoDeliveryLine } from "@lib/util/shipping-address"
import { isWayCardMethod } from "@lib/util/shipping-card"
import CheckoutItemList from "@modules/checkout/components/checkout-item-list"
import CheckoutPickupSummary from "@modules/checkout/components/checkout-pickup-summary"
import DiscountCode from "@modules/checkout/components/discount-code"
import CheckoutTotals from "@modules/checkout/components/checkout-totals"

/**
 * The order summary column (batch 6 part 1): what is bought, the totals, the promo
 * code. On a desktop it is the sticky right column next to the form, the way the
 * Medusa starter's checkout lays it out; on a phone it sits between the form and the
 * payment, where it was before. The payment block is `CheckoutPayment`. A shop that
 * switched the promo code off (t-2026-10-13-11) gets no promo code field.
 */
const CheckoutSummary = async ({ cart }: { cart: HttpTypes.StoreCart }) => {
  // Batch 6: a course in the cart — the access note under the totals (Q3.2).
  const hasCourse = (cart.items ?? []).some(isNoDeliveryLine)
  const tShip = await getTranslations("Shipments")
  const meta = cart.metadata as Record<string, string> | null
  const pickupPointName = meta?.[PICKUP_METADATA_KEYS.name]
  const pickupPointAddress = meta?.[PICKUP_METADATA_KEYS.address]

  // D10: the carrier's tariff the buyer picked in a way card, with its point
  // and term, the way the shop's own pickup point is echoed above.
  const tCheckout = await getTranslations("CheckoutPage")
  const tPochta = await getTranslations("PochtaPoint")
  const promoCode = await getSitePromoCodeEnabled()
  const shippingMethod = cartNeedsShipping(cart) ? cart.shipping_methods?.at(-1) : undefined
  const carrierMethod =
    !pickupPointName && shippingMethod && isWayCardMethod(shippingMethod) ? shippingMethod : null
  const cdekPoint = chosenCdekPoint(cart)
  const pochtaPoint = pochtaPointOf(cart)
  // t-2026-10-14-58: an ApiShip method names its point, term and tariff the same way.
  const apishipMethod = apishipMethodOf(cart)
  const carrierPoint = apishipMethod
    ? apishipPointLine(apishipMethod)
    : cdekPoint
    ? cdekPoint.name ?? cdekPoint.code
    : pochtaPoint
      ? `${[pochtaPoint.pochta_point_address, pochtaPoint.pochta_point_city]
          .filter(Boolean)
          .join(", ")} · ${tPochta("postcode", { index: pochtaPoint.pochta_point_index })}`
      : null
  const carrierTerm = cdekTermOf(cart) ?? pochtaPoint?.term_label ?? apishipMethod?.termLabel ?? null
  const carrierDetails = [carrierTerm, apishipMethod?.tariffName].filter(
    (line): line is string => Boolean(line)
  )

  return (
    <div className="flex flex-col gap-y-6" data-testid="checkout-summary">
      <CheckoutItemList cart={cart} />

      <Divider />

      <div className="flex flex-col gap-y-3">
        <CheckoutTotals cart={cart} />
        {hasCourse && (
          <Text size="small" className="text-ui-fg-subtle" data-testid="checkout-access-note">
            {tShip("accessByEmail")}
          </Text>
        )}
      </div>

      {pickupPointName && (
        <CheckoutPickupSummary
          name={pickupPointName}
          address={pickupPointAddress ?? ""}
        />
      )}

      {carrierMethod && (
        <CheckoutPickupSummary
          label={tCheckout("shippingCost")}
          name={carrierMethod.name}
          address={carrierPoint ?? ""}
          details={carrierDetails}
          testId="checkout-summary-shipping-method"
        />
      )}

      {promoCode && <DiscountCode cart={cart} />}
    </div>
  )
}

export default CheckoutSummary
