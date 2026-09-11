"use client"

import Input from "@modules/common/components/input"
import { useTranslations } from "next-intl"
import { useState } from "react"

/**
 * The card RULES now live in `@lib/demo-card` — a plain module with no
 * `"use client"` on it, so a server route can call `classifyDemoCard` and get
 * the function rather than a client reference (rule 19g). They are re-exported
 * here so every existing import path in checkout keeps working unchanged.
 */
export type { DemoCardValue } from "@lib/demo-card"
export {
  EMPTY_DEMO_CARD,
  luhnValid,
  cardNumberError,
  expiryValid,
  cvcValid,
  isDemoCardComplete,
  classifyDemoCard,
  formatCardNumber,
  formatExpiry,
  formatCvc,
} from "@lib/demo-card"
export type { DemoCardOutcome } from "@lib/demo-card"

import type { DemoCardValue } from "@lib/demo-card"
import { cardNumberError, formatCardNumber, formatExpiry, formatCvc } from "@lib/demo-card"

type DemoCardFieldsProps = {
  value: DemoCardValue
  onChange: (value: DemoCardValue) => void
}

/**
 * The manual-provider card form (checkout mockup frames 6-8). No real payment
 * ever runs through this — the note below is always visible, not just on
 * decline, and the two documented suffixes are read by `classifyDemoCard`
 * above and acted on in `payment-button/providers/manual.tsx`.
 */
const DemoCardFields = ({ value, onChange }: DemoCardFieldsProps) => {
  const t = useTranslations("DemoCard")
  const [numberTouched, setNumberTouched] = useState(false)

  const numberErrorKey = numberTouched ? cardNumberError(value.number) : null

  return (
    <div className="flex flex-col gap-y-3" data-testid="demo-card-fields">
      <div>
        <Input
          label={t("numberLabel")}
          name="demo-card-number"
          inputMode="numeric"
          autoComplete="cc-number"
          value={value.number}
          onChange={(event) =>
            onChange({ ...value, number: formatCardNumber(event.target.value) })
          }
          onBlur={() => setNumberTouched(true)}
          data-testid="demo-card-number-input"
        />
        {numberErrorKey && (
          <div
            className="flex items-center gap-x-2 pt-2 txt-compact-small text-rose-500"
            data-testid="demo-card-number-error"
          >
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full bg-rose-500"
              aria-hidden
            />
            <span>{t(numberErrorKey)}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-3">
        <Input
          label={t("expiryLabel")}
          name="demo-card-expiry"
          inputMode="numeric"
          autoComplete="cc-exp"
          value={value.expiry}
          onChange={(event) =>
            onChange({ ...value, expiry: formatExpiry(event.target.value) })
          }
          data-testid="demo-card-expiry-input"
        />
        <Input
          label={t("cvcLabel")}
          name="demo-card-cvc"
          inputMode="numeric"
          autoComplete="cc-csc"
          value={value.cvc}
          onChange={(event) =>
            onChange({ ...value, cvc: formatCvc(event.target.value) })
          }
          data-testid="demo-card-cvc-input"
        />
      </div>

      <p
        className="txt-compact-xsmall text-ui-fg-subtle"
        data-testid="demo-card-note"
      >
        {t("note")}
      </p>
    </div>
  )
}

export default DemoCardFields
