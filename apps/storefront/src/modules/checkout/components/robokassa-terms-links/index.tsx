"use client"

import { Link } from "@i18n/navigation"
import { legalHref, type LegalLinkContext } from "@lib/util/legal-links"
import { useTranslations } from "next-intl"

/**
 * The two documents a buyer paying through Robokassa opens right at the method
 * (t-2026-10-08-13). The Robokassa contract, clause 4.3.4, asks for the payment terms
 * where the buyer sees them before paying. The shop writes them on its delivery and
 * payment page (`/pages/delivery`, the `shipping` slot), and the offer is the contract
 * itself. Each link shows only while the shop has published its page, the rule of every
 * navigation link (`legalHref`).
 */
export default function RobokassaTermsLinks({ legal }: { legal: LegalLinkContext }) {
  const t = useTranslations("CheckoutPage")
  const paymentTerms = legalHref("shipping", legal)
  const offer = legalHref("terms", legal)

  if (!paymentTerms && !offer) {
    return null
  }

  return (
    <p
      className="flex flex-wrap gap-x-4 gap-y-1 txt-compact-small text-ui-fg-subtle"
      data-testid="robokassa-terms-links"
    >
      {paymentTerms && (
        <Link href={paymentTerms} className="underline" data-testid="robokassa-payment-terms-link">
          {t("paymentTermsLink")}
        </Link>
      )}
      {offer && (
        <Link href={offer} className="underline" data-testid="robokassa-offer-link">
          {t("offerLink")}
        </Link>
      )}
    </p>
  )
}
