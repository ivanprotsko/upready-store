import { PICKUP_METADATA_KEYS } from "@lib/theme/composition"
import type { HttpTypes } from "@medusajs/types"
import { Divider, Text } from "@medusajs/ui"
import { getTranslations } from "next-intl/server"
import { isNoDeliveryLine } from "@lib/util/shipping-address"
import CheckoutItemList from "@modules/checkout/components/checkout-item-list"
import CheckoutPickupSummary from "@modules/checkout/components/checkout-pickup-summary"
import DiscountCode from "@modules/checkout/components/discount-code"
import CheckoutTotals from "@modules/checkout/components/checkout-totals"

/**
 * The order summary column (batch 6 part 1): what is bought, the totals, the promo
 * code. On a desktop it is the sticky right column next to the form, the way the
 * Medusa starter's checkout lays it out; on a phone it sits between the form and the
 * payment, where it was before. The payment block is `CheckoutPayment`.
 */
const CheckoutSummary = async ({ cart }: { cart: HttpTypes.StoreCart }) => {
  // Batch 6: a course in the cart — the access note under the totals (Q3.2).
  const hasCourse = (cart.items ?? []).some(isNoDeliveryLine)
  const tShip = await getTranslations("Shipments")
  const meta = cart.metadata as Record<string, string> | null
  const pickupPointName = meta?.[PICKUP_METADATA_KEYS.name]
  const pickupPointAddress = meta?.[PICKUP_METADATA_KEYS.address]

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

      <DiscountCode cart={cart} />
    </div>
  )
}

export default CheckoutSummary
