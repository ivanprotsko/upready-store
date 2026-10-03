"use client"

import { useId, useRef, useState } from "react"
import { ChevronDown, ChevronRight, CheckMini } from "@medusajs/icons"
import User from "@modules/common/icons/user"
import type { HttpTypes } from "@medusajs/types"
import CheckoutContactsForm from "@modules/checkout/components/checkout-contacts-form"
import { realEmailOrEmpty } from "@lib/util/telegram-contact"
import { useTranslations } from "next-intl"

interface CheckoutContactsRowProps {
  cart: HttpTypes.StoreCart
}

/**
 * t-2026-10-01-checkout-ivan-3 #6/#7: split out of the old `CheckoutInfoRows`
 * (address and contacts combined); an accordion, not a sheet — a click (or
 * Enter/Space, which a `<button>` already gets for free) expands the form
 * right under the title, «Сохранить» collapses it back to the summary and
 * returns focus to the row. Never gated on a digital-only cart — a buyer
 * still needs to be reachable with no delivery at all.
 */
export default function CheckoutContactsRow({ cart }: CheckoutContactsRowProps) {
  const t = useTranslations("CheckoutPage")
  const panelId = useId()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [expanded, setExpanded] = useState(false)

  const addr = cart.shipping_address
  const meta = cart.metadata as Record<string, string> | null

  const buyerFirstName = meta?.contact_first_name || ""
  const buyerLastName = meta?.contact_last_name || ""
  const buyerPhone = meta?.contact_phone || ""
  const buyerName = [buyerFirstName, buyerLastName].filter(Boolean).join(" ")
  const hasContacts = !!(buyerName || realEmailOrEmpty(cart.email))

  const hasDifferentRecipient = meta?.has_different_recipient === "true"
  const recipientName = [addr?.first_name, addr?.last_name]
    .filter(Boolean)
    .join(" ")
  const recipientPhone = addr?.phone || ""

  function collapse() {
    setExpanded(false)
    // The trigger is still in the DOM once the form unmounts; focus it on the
    // next frame so the collapse itself has already happened.
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  return (
    <>
      <div className="h-px bg-ui-border-base w-full" />

      <div className="flex flex-col gap-y-1">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="flex items-center justify-between w-full gap-x-2 py-2 text-start"
          data-testid="checkout-contacts-row"
        >
          <div className="flex items-center gap-x-2">
            <span className="flex-shrink-0 text-ui-fg-base">
              <User size={24} />
            </span>
            <div className="flex flex-col">
              <h2 className="h2-docs text-ui-fg-muted flex items-center gap-x-1.5">
                {t("contactsHeading")}
                {hasContacts && (
                  <CheckMini
                    className="text-ui-tag-green-icon shrink-0"
                    aria-hidden
                    data-testid="contacts-section-checkmark"
                  />
                )}
              </h2>
              {!expanded && hasContacts && (
                <span className="txt-small text-ui-fg-base flex gap-x-2">
                  {buyerName && <span>{buyerName}</span>}
                  {buyerPhone && (
                    <span className="text-ui-fg-muted">{buyerPhone}</span>
                  )}
                </span>
              )}
              {!expanded && hasDifferentRecipient && (recipientName || recipientPhone) && (
                <div className="flex items-center gap-x-2 mt-1">
                  <span className="txt-small text-ui-fg-muted">
                    {t("recipientLabel")}
                  </span>
                  {recipientName && (
                    <span className="txt-small text-ui-fg-base">
                      {recipientName}
                    </span>
                  )}
                  {recipientPhone && (
                    <span className="txt-small text-ui-fg-muted">
                      {recipientPhone}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          {expanded ? (
            <ChevronDown className="text-ui-fg-base flex-shrink-0" />
          ) : (
            <ChevronRight className="text-ui-fg-base flex-shrink-0 rtl:rotate-180" />
          )}
        </button>

        {expanded && (
          <div id={panelId}>
            <CheckoutContactsForm cart={cart} onSaved={collapse} onCancel={collapse} />
          </div>
        )}
      </div>

      <div className="h-px bg-ui-border-base w-full" />
    </>
  )
}
