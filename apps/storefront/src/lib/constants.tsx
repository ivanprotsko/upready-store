import { CreditCard, CurrencyDollar } from "@medusajs/icons"
import Bancontact from "@modules/common/icons/bancontact"
import Ideal from "@modules/common/icons/ideal"
import PayPal from "@modules/common/icons/paypal"
import type { HttpTypes } from "@medusajs/types"
import type React from "react"
import { btcpayReturnUrl, isBtcpay } from "@lib/util/btcpay"
import { bitcartReturnUrl, isBitcart } from "@lib/util/bitcart"

export { isBtcpay, isBitcart }

/* Map of payment provider_id to their icon and, as a fallback for a provider
   with no entry in the `PaymentMethods` catalog, an English title. Add in any
   payment providers you want to use, and their names to `messages/*.json`. */
export const paymentInfoMap: Record<
  string,
  { title: string; icon: React.JSX.Element }
> = {
  pp_stripe_stripe: {
    title: "Credit card",
    icon: <CreditCard />,
  },
  "pp_medusa-payments_default": {
    title: "Credit card",
    icon: <CreditCard />,
  },
  "pp_stripe-ideal_stripe": {
    title: "iDeal",
    icon: <Ideal />,
  },
  "pp_stripe-bancontact_stripe": {
    title: "Bancontact",
    icon: <Bancontact />,
  },
  pp_paypal_paypal: {
    title: "PayPal",
    icon: <PayPal />,
  },
  pp_system_default: {
    title: "Manual Payment",
    icon: <CreditCard />,
  },
  // Robokassa (RUB, card + SBP), a redirect provider with per-shop credentials
  // (t03-tenant-secrets-robokassa). The backend lists it only for a shop that
  // saved its account in the panel.
  pp_robokassa_robokassa: {
    title: "Robokassa",
    icon: <CreditCard />,
  },
  // The shop's own BTCPay Server store (ask-20261005-070255-438f), a redirect
  // provider like Robokassa. Listed only where the owner switched it on.
  pp_btcpay_btcpay: {
    title: "Cryptocurrency",
    icon: <CurrencyDollar />,
  },
  // The shop's own Bitcart store (ask-20261005-070255-438f, stage 2), the
  // same kind of redirect. A shop with both lists both, told apart by the
  // processor name the checkout prints next to each.
  pp_bitcart_bitcart: {
    title: "Cryptocurrency",
    icon: <CurrencyDollar />,
  },
  // Add more payment providers here
}

// This only checks if it is native stripe or medusa payments for card payments, it ignores the other stripe-based providers
export const isStripeLike = (providerId?: string) => {
  return (
    providerId?.startsWith("pp_stripe_") || providerId?.startsWith("pp_medusa-")
  )
}

export const isRobokassa = (providerId?: string) => {
  return providerId?.startsWith("pp_robokassa_")
}

/**
 * Where Robokassa sends the customer back. Both outcomes land on the
 * storefront's payment return route, which reads the order the Result
 * webhook produced; the browser return itself proves nothing
 * (`app/api/payment-return/route.ts`). Built in the browser, because the
 * shop's public origin is the one the customer is on.
 */
const robokassaReturnUrl = (cart: HttpTypes.StoreCart, outcome: "success" | "fail") => {
  const locale =
    typeof window !== "undefined" ? window.location.pathname.split("/")[1] || "" : ""
  const params = new URLSearchParams({
    provider: "robokassa",
    cart_id: cart.id,
    outcome,
  })
  if (locale) {
    params.set("locale", locale)
  }
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  return `${origin}/api/payment-return?${params.toString()}`
}

const paymentSessionDataBuilders: Array<{
  test: (providerId?: string) => boolean | undefined
  isReady?: (cart: HttpTypes.StoreCart) => boolean
  build: (cart: HttpTypes.StoreCart) => Record<string, unknown>
}> = [
  {
    test: isRobokassa,
    build: (cart) => ({
      success_url: robokassaReturnUrl(cart, "success"),
      fail_url: robokassaReturnUrl(cart, "fail"),
      email: cart.email ?? undefined,
      culture:
        typeof window !== "undefined" &&
        window.location.pathname.split("/")[1] === "ru"
          ? "ru"
          : "en",
    }),
  },
  {
    // BTCPay sends the buyer back to the same return route; the locale also
    // picks the language of BTCPay's own checkout page.
    test: isBtcpay,
    build: (cart) => {
      const locale =
        typeof window !== "undefined" ? window.location.pathname.split("/")[1] || "" : ""
      const origin = typeof window !== "undefined" ? window.location.origin : ""
      return {
        return_url: btcpayReturnUrl(cart.id, { origin, locale }),
        ...(locale ? { locale } : {}),
      }
    },
  },
  {
    // Bitcart sends the buyer back to the same return route. Its checkout
    // page takes no language from the invoice, so only the address goes.
    test: isBitcart,
    build: (cart) => {
      const locale =
        typeof window !== "undefined" ? window.location.pathname.split("/")[1] || "" : ""
      const origin = typeof window !== "undefined" ? window.location.origin : ""
      return { return_url: bitcartReturnUrl(cart.id, { origin, locale }) }
    },
  },
]

export const buildPaymentSessionData = (
  providerId: string | undefined,
  cart: HttpTypes.StoreCart
) => {
  return paymentSessionDataBuilders.find((b) => b.test(providerId))?.build(cart)
}

export const isPaymentSessionReady = (
  providerId: string | undefined,
  cart: HttpTypes.StoreCart
) => {
  const entry = paymentSessionDataBuilders.find((b) => b.test(providerId))
  return entry?.isReady ? entry.isReady(cart) : true
}

export const isPaypal = (providerId?: string) => {
  return providerId?.startsWith("pp_paypal")
}
export const isManual = (providerId?: string) => {
  return providerId?.startsWith("pp_system_default")
}

export const addressAutocompleteProvider =
  process.env.NEXT_PUBLIC_ADDRESS_AUTOCOMPLETE_PROVIDER

export const addressAutocompleteApiKey =
  process.env.NEXT_PUBLIC_ADDRESS_AUTOCOMPLETE_PROVIDER_API_KEY

export const isDaData = (provider?: string) => provider === "dadata"

/**
 * Whether a suggest provider can actually suggest. DaData answers nothing
 * without its token, and a shop deployed without one (the multi-tenant host
 * sets neither variable) then shows a single address line that collects a
 * quarter of an address. The checkout falls back to the structured fields
 * whenever this is false, so the customer types city and index by hand.
 */
export const hasAddressAutocomplete = Boolean(
  isDaData(addressAutocompleteProvider) && addressAutocompleteApiKey
)

// Add currencies that don't need to be divided by 100
export const noDivisionCurrencies = [
  "krw",
  "jpy",
  "vnd",
  "clp",
  "pyg",
  "xaf",
  "xof",
  "bif",
  "djf",
  "gnf",
  "kmf",
  "mga",
  "rwf",
  "xpf",
  "htg",
  "vuv",
  "xag",
  "xdr",
  "xau",
]
