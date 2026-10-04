"use client"

import { useId, type ReactNode } from "react"
import { Link } from "@i18n/navigation"
import type { CheckoutConsentValue } from "@lib/util/checkout-consent"
import { consentHref, type LegalLinkContext } from "@lib/util/legal-links"
import { Checkbox, Label } from "@medusajs/ui"
import { useTranslations } from "next-intl"

type Props = {
  value: CheckoutConsentValue
  onChange: (next: CheckoutConsentValue) => void
  legal: LegalLinkContext
  disabled?: boolean
}

/**
 * The consents right before the pay button (Ivan 04.10.2026: «обязательный чекбокс перед
 * оплатой … всё уже было учтено в проекте chrxnasdmds»), ported from chrxnasdmds
 * `consent-checkboxes` (9ab52a96, wording in its `m-commerce.ts`) and cut to the 04.10
 * checklist: the offer is accepted by pressing the button (the sentence under it, C2), so
 * the boxes are
 *   - personal data, mandatory and its own control, never merged into the offer (C1,
 *     152-ФЗ ст. 9); `PaymentButton` stays disabled until it is ticked;
 *   - marketing mailings, optional (C4).
 * Neither is ticked in advance (C5). The record of both goes onto the order
 * (`@lib/util/checkout-consent`, C3).
 *
 * The personal-data box links the privacy policy alone: shops here have no separate consent
 * page (`TENANT_PAGE_KEYS`), and `consentHref` resolves it the way the sentence does.
 */
export default function CheckoutConsent({ value, onChange, legal, disabled = false }: Props) {
  const t = useTranslations("CheckoutConsent")
  const personalDataId = useId()
  const marketingId = useId()
  const privacyHref = consentHref("privacy", legal)

  // A named function expression, because `react/display-name` counts any anonymous
  // function that returns JSX as a component without a name.
  const privacy = function PrivacyDocument(chunks: ReactNode) {
    return privacyHref ? (
      <Link href={privacyHref} target="_blank" className="underline">
        {chunks}
      </Link>
    ) : (
      <>{chunks}</>
    )
  }

  return (
    <div className="flex flex-col gap-y-3" data-testid="checkout-consent">
      <div className="flex items-start gap-x-2">
        <Checkbox
          id={personalDataId}
          className="mt-0.5"
          checked={value.personalData}
          disabled={disabled}
          onCheckedChange={(checked) => onChange({ ...value, personalData: checked === true })}
          aria-required="true"
          data-testid="consent-personal-data"
        />
        <Label htmlFor={personalDataId} className="text-ui-fg-subtle !txt-medium cursor-pointer">
          {t.rich("personalData", { privacy })}
          <span className="text-ui-fg-error" aria-hidden>
            {" *"}
          </span>
        </Label>
      </div>
      <div className="flex items-start gap-x-2">
        <Checkbox
          id={marketingId}
          className="mt-0.5"
          checked={value.marketing}
          disabled={disabled}
          onCheckedChange={(checked) => onChange({ ...value, marketing: checked === true })}
          data-testid="consent-marketing"
        />
        <Label htmlFor={marketingId} className="text-ui-fg-subtle !txt-medium cursor-pointer">
          {t("marketing")}
        </Label>
      </div>
    </div>
  )
}
