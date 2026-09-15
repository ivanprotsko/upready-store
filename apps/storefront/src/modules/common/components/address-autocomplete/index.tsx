"use client"

import { useId, useState } from "react"
import { Checkbox, Label } from "@medusajs/ui"
import { useTranslations } from "next-intl"
import { hasAddressAutocomplete } from "@lib/constants"
import DaDataAddressInput from "./providers/dadata"
import ManualAddressFields from "./manual-address-fields"
import type { AddressAutocompleteProps } from "./types"

export type { AddressFields } from "./types"

/**
 * The address block of the checkout sheets.
 *
 * With a working suggest provider the customer types one line and the provider
 * fills city, index and region behind it, with the checkbox as the escape
 * hatch for an address the suggest cannot find. Without one there is nothing
 * to escape from and nothing to fill the structured fields, so the manual
 * fields are the only form shown: a single free-text line let the customer pay
 * for an order carrying no city and no index, which is a parcel the shop
 * cannot post (f04-address-without-city, order #5 on
 * `cherkashino.shipshift.dev`, 2026-09-15).
 *
 * "Configured" means the provider can actually answer: DaData with an empty
 * token renders a suggest box that never suggests, which collects the same
 * quarter address as the free-text line it replaced. `hasAddressAutocomplete`
 * in `@lib/constants` is that one test.
 */
const AddressAutocomplete = (props: AddressAutocompleteProps) => {
  const t = useTranslations("CheckoutPage")
  const uid = useId()
  const [manual, setManual] = useState(false)

  if (!hasAddressAutocomplete) {
    return (
      <div className="flex flex-col gap-y-3">
        <ManualAddressFields {...props} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-y-3">
      <div className="flex items-center gap-x-2">
        <Checkbox
          id={uid}
          checked={manual}
          onCheckedChange={(value) => setManual(value === true)}
        />
        {/* A caption that is not a `<label for>` only looks clickable: clicking
            the words did nothing, so the escape hatch out of the suggest box
            was reachable by the 16px box alone (measured on the f04 stand,
            2026-09-15). */}
        <Label htmlFor={uid} className="text-ui-fg-subtle cursor-pointer">
          {t("manualInput")}
        </Label>
      </div>

      {manual ? (
        <ManualAddressFields {...props} />
      ) : (
        <DaDataAddressInput {...props} />
      )}
    </div>
  )
}

export default AddressAutocomplete
