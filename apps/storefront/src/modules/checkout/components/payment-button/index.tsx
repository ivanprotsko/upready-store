"use client"

import {
  isManual,
  isPaymentSessionReady,
  isRobokassa,
  isStripeLike,
} from "@lib/constants"
import type { ManualPaymentKind } from "@lib/tenant/manual-payment"
import { convertToLocale } from "@lib/util/money"
import { cartShippingAddressGaps } from "@lib/util/shipping-address"
import type { HttpTypes } from "@medusajs/types"
import { Button } from "@medusajs/ui"
import { useCartUpdate } from "@modules/checkout/context/cart-update-context"
import {
  EMPTY_DEMO_CARD,
  isDemoCardComplete,
  type DemoCardValue,
} from "@modules/checkout/components/demo-card-fields"
import { useLocale, useTranslations } from "next-intl"
import type React from "react"
import ManualPaymentButton from "./providers/manual"
import RobokassaPaymentButton from "./providers/robokassa"
import StripePaymentButton from "./providers/stripe"
import { realEmailOrEmpty } from "@lib/util/telegram-contact"

type PaymentButtonProps = {
  cart: HttpTypes.StoreCart
  selectedPaymentMethod?: string
  demoCard?: DemoCardValue
  /** The offline kind chosen inside the manual provider (olavka-payments); null keeps the demo card gate. */
  manualKind?: ManualPaymentKind | null
  "data-testid": string
}

/**
 * Picks the button that places the order for the payment provider the customer
 * selected. A new provider takes a file under `providers/`, written against the
 * `PaymentProviderButtonProps` of `shared.tsx`, and a case below.
 */
const PaymentButton: React.FC<PaymentButtonProps> = ({
  cart,
  selectedPaymentMethod,
  demoCard,
  manualKind = null,
  "data-testid": dataTestId,
}) => {
  const t = useTranslations("PaymentButton")
  const locale = useLocale()
  const { isCartUpdating } = useCartUpdate()

  const activePaymentMethod =
    selectedPaymentMethod ??
    cart.payment_collection?.payment_sessions?.[0]?.provider_id ??
    ""

  // The demo card gates the manual provider only while it IS the manual
  // provider's form; an offline kind (olavka-payments) has no card to fill in.
  const manualCardIncomplete = Boolean(
    isManual(activePaymentMethod) &&
      !manualKind &&
      !isDemoCardComplete(demoCard ?? EMPTY_DEMO_CARD)
  )

  // f04-address-without-city: a shipping address that exists is not an address
  // a carrier accepts. An order without city and index cannot be posted, so the
  // button stays disabled until those fields are filled;
  // `checkout-payment-section` renders the reason above it. A pickup cart has
  // its address blanked on purpose and is not held here.
  const addressIncomplete = cartShippingAddressGaps(cart).length > 0

  const notReady =
    !cart ||
    !cart.shipping_address ||
    !cart.billing_address ||
    // A Telegram buyer's cart starts with the synthetic `tg_<id>@telegram.local`,
    // which no letter can reach: the order waits for a real address.
    !realEmailOrEmpty(cart.email) ||
    addressIncomplete ||
    (cart.shipping_methods?.length ?? 0) < 1 ||
    !activePaymentMethod ||
    !isPaymentSessionReady(activePaymentMethod, cart) ||
    manualCardIncomplete

  const providerProps = {
    cart,
    notReady,
    cartUpdating: isCartUpdating,
    demoCard,
    manualKind,
    label: (
      <>
        {/* An offline kind places the order without paying here, so the
            button says so rather than «Pay». */}
        {manualKind && isManual(activePaymentMethod)
          ? t("placeOrderManual")
          : t("placeOrder")}
        {/* U-09 (46df): the amount takes the label's own color, so it reads
            exactly as well as the label does. The disabled token it wore was
            the audit's low-contrast finding; the lighter weight is what sets
            it apart now. */}
        <span className="font-normal">
          {convertToLocale({
            amount: cart.total ?? 0,
            currency_code: cart.currency_code,
            locale,
          })}
        </span>
      </>
    ),
    "data-testid": dataTestId,
  }

  switch (true) {
    case isStripeLike(activePaymentMethod):
      return <StripePaymentButton {...providerProps} />
    case isManual(activePaymentMethod):
      return <ManualPaymentButton {...providerProps} />
    case isRobokassa(activePaymentMethod):
      return <RobokassaPaymentButton {...providerProps} />
    default:
      return (
        <Button disabled size="large" className="w-full">
          {t("selectPaymentMethod")}
        </Button>
      )
  }
}

export default PaymentButton
