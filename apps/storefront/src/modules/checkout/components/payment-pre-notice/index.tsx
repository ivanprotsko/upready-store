"use client"

import type { ReactNode } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Link } from "@i18n/navigation"
import { consentHref, type LegalLinkContext } from "@lib/util/legal-links"
import { formatChargeAmount, type PaymentPreNoticeEntry } from "@lib/util/payment-pre-notice"

type Props = {
  entry: PaymentPreNoticeEntry
  buttonText: string
  seller: string
  legal: LegalLinkContext
  /** `cart.total * getChargeConversionFactor(...)`, re-fetched whenever the charge currency changes; `null` while unknown or unreliable. */
  amount: number | null
}

/**
 * The pre-payment notice (rule 5zd, t-2026-10-03-32): a left-accent-bar block
 * directly above the pay button, named after the Timeweb top-up form Ivan
 * flagged. Rendered only while `shouldShowPrePaymentNotice` says to
 * (`checkout-payment-section`), which is also what decides `entry`,
 * `seller`, `buttonText` and `amount` — this component composes the two
 * sentences and renders them, nothing more.
 */
export default function PaymentPreNotice({ entry, buttonText, seller, legal, amount }: Props) {
  const t = useTranslations("PaymentPreNotice")
  const locale = useLocale()

  const termsHref = consentHref("terms", legal)
  const privacyHref = consentHref("privacy", legal)

  // A named function expression, because `react/display-name` counts any
  // anonymous function that returns JSX as a component without a name
  // (same fix `checkout-payment-section`'s own `legalChunk` uses).
  const legalChunk = (href: string | null) =>
    function LegalChunk(chunks: ReactNode) {
      return href ? (
        <Link href={href} className="underline">
          {chunks}
        </Link>
      ) : (
        <>{chunks}</>
      )
    }

  const redirectClause = entry.redirectKind
    ? t("redirect", { kind: entry.redirectKind, value: entry.redirectValue ?? "" })
    : null

  const currency = entry.chargeCurrencyCode
  // The three charge sentences reach the browser only for a shop whose notice names a
  // charge currency or a rate source (`CLIENT_MESSAGE_RULES`, part A6c), and they leave
  // together. A page opened before the owner saved one holds the older dictionary, so the
  // sentence is asked for first: the notice then goes without it, never with a key's name.
  const chargeClause = !currency || !t.has("chargeNoSource")
    ? null
    : !entry.rateSource
      ? t("chargeNoSource", { currency: currency.toUpperCase() })
      : amount !== null
        ? t("chargeWithAmount", {
            currency: currency.toUpperCase(),
            rateSource: entry.rateSource,
            amount: formatChargeAmount(amount, currency, locale),
          })
        : t("chargeWithoutAmount", { currency: currency.toUpperCase(), rateSource: entry.rateSource })

  const refundClause = entry.refundTerms ? t("refund", { terms: entry.refundTerms }) : null

  const secondParagraph = [redirectClause, chargeClause, refundClause].filter(Boolean).join(" ")

  return (
    <div
      className="flex flex-col gap-y-1.5 rounded-md border-l-2 border-ui-border-interactive bg-ui-bg-subtle px-4 py-3"
      data-testid="payment-pre-notice"
    >
      <p className="txt-compact-small text-ui-fg-base">
        {t.rich("becomesClient", {
          button: buttonText,
          seller,
          terms: legalChunk(termsHref),
          privacy: legalChunk(privacyHref),
        })}
      </p>
      {secondParagraph && (
        <p className="txt-compact-small text-ui-fg-subtle" data-testid="payment-pre-notice-details">
          {secondParagraph}
        </p>
      )}
    </div>
  )
}
