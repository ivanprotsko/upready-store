"use client"

import { useId, useRef, useState } from "react"
import { ChevronRight, CheckMini, Clock } from "@medusajs/icons"
import MapPin from "@modules/common/icons/map-pin"
import type { HttpTypes } from "@medusajs/types"
import CheckoutAddressForm from "@modules/checkout/components/checkout-address-form"
import { isPickupShippingOption } from "@lib/util/fulfillment"
import { cartShippingAddressGaps } from "@lib/util/shipping-address"
import { PICKUP_METADATA_KEYS } from "@lib/theme/composition"
import { usePickupSheet } from "@modules/checkout/context/pickup-sheet-context"
import { useTranslations } from "next-intl"

interface CheckoutAddressRowProps {
  cart: HttpTypes.StoreCart
  addresses: HttpTypes.StoreCustomerAddress[] | null
  availableShippingMethods:
    | HttpTypes.StoreCartShippingOptionWithServiceZone[]
    | null
}

/**
 * t-2026-10-01-checkout-ivan-3 #6/#7: split out of the old `CheckoutInfoRows`
 * (which combined this with the contacts row), address above the delivery
 * method rather than below it. The address form expands inline under the
 * title (no sheet); the pickup-point MAP stays a sheet — it
 * is a map, not a form, and item 7 only asked to retire the two that are.
 * The parent decides whether to render this at all — a digital-only cart has
 * no delivery address.
 */
export default function CheckoutAddressRow({
  cart,
  addresses,
  availableShippingMethods,
}: CheckoutAddressRowProps) {
  const t = useTranslations("CheckoutPage")
  const tPickup = useTranslations("PickupPoint")
  const panelId = useId()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [editing, setEditing] = useState(false)
  const { openSheet: openPickupSheet } = usePickupSheet()

  const addr = cart.shipping_address
  const meta = cart.metadata as Record<string, string> | null

  const selectedShippingOptionId =
    cart.shipping_methods?.at(-1)?.shipping_option_id
  const selectedShippingOption = availableShippingMethods?.find(
    (option) => option.id === selectedShippingOptionId
  )
  const isPickup = isPickupShippingOption(selectedShippingOption)

  const hasAddress = !!addr?.address_1
  const addressText = hasAddress
    ? [addr?.address_1, addr?.city, addr?.postal_code]
        .filter(Boolean)
        .join(", ")
    : null

  const pickupPointName = meta?.[PICKUP_METADATA_KEYS.name] || ""
  const pickupPointAddress = meta?.[PICKUP_METADATA_KEYS.address] || ""
  const pickupPointHours = meta?.[PICKUP_METADATA_KEYS.hours] || ""
  const hasPickupPoint = isPickup && !!pickupPointName

  // t-2026-10-01-checkout-ivan-3 #3: the same bar `cartShippingAddressGaps`
  // already holds the order to (`payment-button`'s own `notReady` gate), so
  // the checkmark never lights up on an address the backend would reject.
  const isComplete = isPickup
    ? hasPickupPoint
    : hasAddress && cartShippingAddressGaps(cart).length === 0

  // Batch 6 part 1: no collapsed row to discover. While the address is not complete
  // the form is open under the heading; once it is, the section shows the address
  // and «Изменить». The header keeps `checkout-address-row` in both states and is a
  // button only when there is something to open.
  const showForm = editing || !isComplete

  function collapse() {
    setEditing(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const addressHeading = (
    <span className="flex items-center gap-x-2">
      <span className="flex-shrink-0 text-ui-fg-base">
        <MapPin size={24} />
      </span>
      <h2 className="h2-docs text-ui-fg-base flex items-center gap-x-1.5">
        {t("addressHeading")}
        {isComplete && (
          <CheckMini
            className="text-ui-tag-green-icon shrink-0"
            aria-hidden
            data-testid="address-section-checkmark"
          />
        )}
      </h2>
    </span>
  )

  return (
    <>
      <div className="h-px bg-ui-border-base w-full first:hidden" />

      {isPickup ? (
        <button
          onClick={openPickupSheet}
          className="flex items-center justify-between w-full gap-x-2 py-2 text-start"
          data-testid="checkout-pickup-point-row"
        >
          <div className="flex items-center gap-x-2 min-w-0">
            <span className="flex-shrink-0 text-ui-fg-base">
              <MapPin size={24} />
            </span>
            <div className="flex flex-col min-w-0">
              <h2 className="h2-docs text-ui-fg-base flex items-center gap-x-1.5">
                {tPickup("label")}
                {isComplete && (
                  <CheckMini
                    className="text-ui-tag-green-icon shrink-0"
                    aria-hidden
                    data-testid="address-section-checkmark"
                  />
                )}
              </h2>
              {hasPickupPoint ? (
                <>
                  <span className="txt-small text-ui-fg-base">
                    {pickupPointName}
                  </span>
                  <span className="txt-small text-ui-fg-subtle">
                    {pickupPointAddress}
                  </span>
                  {pickupPointHours && (
                    <span className="txt-small text-ui-fg-subtle flex items-center gap-x-1">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      {pickupPointHours}
                    </span>
                  )}
                </>
              ) : (
                <span className="txt-small text-ui-fg-muted">
                  {tPickup("choose")}
                </span>
              )}
            </div>
          </div>
          <ChevronRight className="text-ui-fg-base flex-shrink-0 rtl:rotate-180" />
        </button>
      ) : (
        <div className="flex flex-col gap-y-1">
          {showForm ? (
            <div className="py-2" data-testid="checkout-address-row">
              {addressHeading}
            </div>
          ) : (
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setEditing(true)}
              aria-expanded={false}
              aria-controls={panelId}
              className="flex items-start justify-between w-full gap-x-4 py-2 text-start"
              data-testid="checkout-address-row"
            >
              <span className="flex flex-col gap-y-1">
                {addressHeading}
                {addressText && (
                  <span className="ps-8 txt-small text-ui-fg-base">
                    {addressText}
                  </span>
                )}
              </span>
              <span className="txt-compact-small-plus text-ui-fg-interactive shrink-0 pt-1">
                {t("edit")}
              </span>
            </button>
          )}

          {showForm && (
            <div id={panelId}>
              <CheckoutAddressForm
                cart={cart}
                addresses={addresses}
                onSaved={collapse}
                // Nothing to go back to while the address is not complete: the form
                // stays, a «Закрыть» would only bring the empty row back.
                onCancel={isComplete ? collapse : undefined}
                // Focus moves only when the buyer opened the form; an open-by-default
                // form must not pull the page down to itself on load.
                autoFocus={editing}
              />
            </div>
          )}
        </div>
      )}
    </>
  )
}
