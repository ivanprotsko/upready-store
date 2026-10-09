"use client"

import { legalHref, type LegalLinkContext } from "@lib/util/legal-links"
import LegalPageLink from "@modules/checkout/components/legal-page-link"
import { useTranslations } from "next-intl"

/**
 * The payment and delivery terms and the returns rules, one line right above the pay
 * button (t-2026-10-08-13). The Robokassa contract, clause 4.3.4, asks for the payment
 * terms where the buyer sees them before paying; the shop writes them on its delivery
 * and payment page (`/pages/delivery`, the `shipping` slot).
 *
 * t-2026-10-09-56 (Ivan 09.10: «и тем более без дубликатов»): the offer left this line,
 * because the sentence under it names the offer already, and the returns rules joined
 * it from the «Доставка» / «Правила возврата» pair that stood under the button, which
 * linked the delivery page a second time. Each link shows only while the shop has
 * published its page (`legalHref`) and opens over the checkout (`LegalPageLink`).
 */
export default function RobokassaTermsLinks({ legal }: { legal: LegalLinkContext }) {
  const t = useTranslations("CheckoutPage")
  const paymentTerms = legalHref("shipping", legal)
  const returns = legalHref("returns", legal)

  if (!paymentTerms && !returns) {
    return null
  }

  return (
    <p
      className="flex flex-wrap gap-x-4 gap-y-1 txt-compact-small text-ui-fg-subtle"
      data-testid="robokassa-terms-links"
    >
      {paymentTerms && (
        <LegalPageLink href={paymentTerms} data-testid="robokassa-payment-terms-link">
          {t("paymentTermsLink")}
        </LegalPageLink>
      )}
      {returns && (
        <LegalPageLink href={returns} data-testid="checkout-returns-link">
          {t("returnsLink")}
        </LegalPageLink>
      )}
    </p>
  )
}
