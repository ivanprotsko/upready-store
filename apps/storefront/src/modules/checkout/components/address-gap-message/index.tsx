"use client"

import { useLocale, useTranslations } from "next-intl"
import {
  addressGapSentences,
  type ShippingAddressField,
} from "@lib/util/shipping-address"

/**
 * The red sentences that name what an address still lacks before a parcel can be
 * posted: the address sheet shows them under its form, the payment step above
 * «Оплатить». Both read the same `addressGapSentences`, so the two places cannot
 * name different fields for one cart again (t-2026-09-24-n19).
 */
export default function AddressGapMessage({
  gaps,
  className,
  "data-testid": dataTestId,
}: {
  gaps: ShippingAddressField[]
  className?: string
  "data-testid"?: string
}) {
  const t = useTranslations("CheckoutPage")
  const locale = useLocale()
  const sentences = addressGapSentences(gaps, t, locale)
  if (sentences.length === 0) return null

  return (
    <div
      role="alert"
      // Joined, not merged with `clx`: tailwind-merge reads `text-small-regular`
      // as a text colour and drops `text-rose-500`, and the sentence turns black.
      className={["flex flex-col gap-y-1 text-rose-500 text-small-regular", className]
        .filter(Boolean)
        .join(" ")}
      data-testid={dataTestId}
    >
      {sentences.map((sentence) => (
        <span key={sentence}>{sentence}</span>
      ))}
    </div>
  )
}
