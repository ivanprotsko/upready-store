"use client"

import { useId, useRef, useState } from "react"
import { CheckMini } from "@medusajs/icons"
import { clx } from "@medusajs/ui"
import User from "@modules/common/icons/user"
import type { HttpTypes } from "@medusajs/types"
import CheckoutContactsForm, {
  contactsFieldErrors,
} from "@modules/checkout/components/checkout-contacts-form"
import { realEmailOrEmpty } from "@lib/util/telegram-contact"
import { useTranslations } from "next-intl"

interface CheckoutContactsRowProps {
  cart: HttpTypes.StoreCart
  /**
   * t-2026-10-09-56 (Ivan's item 7): the sections before this one are not done
   * yet, so this one shows its heading alone (`checkoutStepLocksOf`).
   */
  locked?: boolean
}

/**
 * t-2026-10-01-checkout-ivan-3 #6/#7: split out of the old `CheckoutInfoRows`
 * (address and contacts combined). Never gated on a digital-only cart — a buyer
 * still needs to be reachable with no delivery at all.
 *
 * Batch 6 part 1: no collapsed row to discover. While the contacts are not complete
 * (the same test the form saves by, `contactsFieldErrors`), the form is simply open
 * under the heading; once they are, the section shows what was saved and
 * «Изменить» opens the form again. The header keeps `checkout-contacts-row` in both
 * states and is a button only when there is something to open, so a click on the
 * heading of an open form never folds it away.
 */
export default function CheckoutContactsRow({
  cart,
  locked = false,
}: CheckoutContactsRowProps) {
  const t = useTranslations("CheckoutPage")
  const panelId = useId()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [editing, setEditing] = useState(false)

  const addr = cart.shipping_address
  const meta = cart.metadata as Record<string, string> | null

  const buyerFirstName = meta?.contact_first_name || ""
  const buyerLastName = meta?.contact_last_name || ""
  const buyerPhone = meta?.contact_phone || ""
  const buyerEmail = realEmailOrEmpty(cart.email)
  const buyerName = [buyerFirstName, buyerLastName].filter(Boolean).join(" ")

  const hasDifferentRecipient = meta?.has_different_recipient === "true"
  const recipientName = [addr?.first_name, addr?.last_name]
    .filter(Boolean)
    .join(" ")
  const recipientPhone = addr?.phone || ""

  const isComplete =
    Object.keys(
      contactsFieldErrors(
        {
          first_name: buyerFirstName,
          last_name: buyerLastName,
          email: buyerEmail,
          recipient_first_name: hasDifferentRecipient ? addr?.first_name || "" : "",
          recipient_last_name: hasDifferentRecipient ? addr?.last_name || "" : "",
        },
        hasDifferentRecipient
      )
    ).length === 0
  const showForm = editing || !isComplete

  function collapse() {
    setEditing(false)
    // The trigger is back in the DOM once the form unmounts; focus it on the
    // next frame so the collapse itself has already happened.
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const heading = (
    <span className="flex items-center gap-x-2">
      <span
        className={clx("flex-shrink-0", locked ? "text-ui-fg-disabled" : "text-ui-fg-base")}
      >
        <User size={24} />
      </span>
      <h2
        className={clx(
          "h2-docs flex items-center gap-x-1.5",
          locked ? "text-ui-fg-disabled" : "text-ui-fg-base"
        )}
      >
        {t("contactsHeading")}
        {isComplete && !locked && (
          <CheckMini
            className="text-status-success shrink-0"
            aria-hidden
            data-testid="contacts-section-checkmark"
          />
        )}
      </h2>
    </span>
  )

  return (
    <>
      <div className="h-px bg-ui-border-base w-full first:hidden" />

      <div className="flex flex-col gap-y-1">
        {locked ? (
          <div className="py-2" aria-disabled="true" data-testid="checkout-contacts-locked">
            {heading}
          </div>
        ) : showForm ? (
          <div className="py-2" data-testid="checkout-contacts-row">
            {heading}
          </div>
        ) : (
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setEditing(true)}
            aria-expanded={false}
            aria-controls={panelId}
            className="flex items-start justify-between w-full gap-x-4 py-2 text-start"
            data-testid="checkout-contacts-row"
          >
            <span className="flex flex-col gap-y-1">
              {heading}
              <span className="flex flex-col gap-y-0.5 ps-8 txt-small">
                {buyerName && <span className="text-ui-fg-base">{buyerName}</span>}
                {(buyerEmail || buyerPhone) && (
                  <span className="text-ui-fg-subtle">
                    {[buyerEmail, buyerPhone].filter(Boolean).join(" · ")}
                  </span>
                )}
                {hasDifferentRecipient && (recipientName || recipientPhone) && (
                  <span className="text-ui-fg-subtle">
                    {t("recipientLabel")}{" "}
                    <span className="text-ui-fg-base">
                      {[recipientName, recipientPhone].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                )}
              </span>
            </span>
            <span className="txt-compact-small-plus text-ui-fg-interactive shrink-0 pt-1">
              {t("edit")}
            </span>
          </button>
        )}

        {showForm && !locked && (
          <div id={panelId}>
            <CheckoutContactsForm
              cart={cart}
              onSaved={collapse}
              // Nothing to go back to while the contacts are not complete: the form
              // stays, a «Закрыть» would only bring the empty row back.
              onCancel={isComplete ? collapse : undefined}
              // Focus moves only when the buyer opened the form; an open-by-default
              // form must not pull the page down to itself on load.
              autoFocus={editing}
            />
          </div>
        )}
      </div>

      <div className="h-px bg-ui-border-base w-full" />
    </>
  )
}
