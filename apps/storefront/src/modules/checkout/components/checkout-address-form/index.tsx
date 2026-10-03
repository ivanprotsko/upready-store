"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { usePathname, useRouter } from "next/navigation"
import { setAddresses, updateRegion } from "@lib/data/cart"
import type { HttpTypes } from "@medusajs/types"
import Input from "@modules/common/components/input"
import ErrorMessage from "@modules/checkout/components/error-message"
import { useTranslations } from "next-intl"
import AddressAutocomplete, {
  type AddressFields,
} from "@modules/common/components/address-autocomplete"
import { Button, RadioGroup } from "@medusajs/ui"
import { useLocaleDirection } from "@lib/hooks/use-locale-direction"
import {
  cartCountryCode,
  shippingAddressGaps,
  type ShippingAddressField,
} from "@lib/util/shipping-address"
import AddressGapMessage from "@modules/checkout/components/address-gap-message"

/**
 * The sentences a customer can act on when the address cannot be posted: the
 * typed fields named one by one, and one of its own for the province (U-08,
 * 46df UX audit; t-2026-09-24-n19).
 */
function AddressIncompleteMessage({ gaps }: { gaps: ShippingAddressField[] }) {
  return (
    <AddressGapMessage
      gaps={gaps}
      className="pt-2"
      data-testid="address-incomplete-message"
    />
  )
}

interface CheckoutAddressFormProps {
  cart: HttpTypes.StoreCart
  addresses: HttpTypes.StoreCustomerAddress[] | null
  /** Called once the address is saved — the row collapses back to its summary. */
  onSaved: () => void
  /**
   * Called on an explicit cancel — same collapse, nothing written. Absent while the
   * address is not complete (batch 6 part 1): the form then has no «Закрыть».
   */
  onCancel?: () => void
  /** Focus the form on mount: only when the buyer opened it themselves. */
  autoFocus?: boolean
}

/**
 * t-2026-10-01-checkout-ivan-3 #7: inline accordion body, not a popup sheet.
 * `CheckoutAddressRow` mounts this only while expanded, which also replaces
 * the old sheet's own re-seed guard: a fresh mount means `useState`'s
 * initialiser runs once, from the cart as it is right then, and a sibling's
 * `router.refresh()` while this stays open cannot overwrite what the
 * customer already typed (rule 19h — the same property the old sheet's
 * `wasOpen` ref existed to get, for free here).
 */
export default function CheckoutAddressForm({
  cart,
  addresses,
  onSaved,
  onCancel,
  autoFocus = true,
}: CheckoutAddressFormProps) {
  const t = useTranslations("CheckoutPage")
  const dir = useLocaleDirection()
  const router = useRouter()
  const pathname = usePathname()
  const shippingAddress = cart.shipping_address
  // A cart opened but never addressed has no `country_code` yet, so the region
  // it belongs to answers which country's rules the form follows.
  const countryCode = cartCountryCode(cart)

  const savedAddresses = addresses ?? []
  const hasSaved = savedAddresses.length > 0

  const matchingAddress = savedAddresses.find(
    (address) =>
      address.address_1 === shippingAddress?.address_1 &&
      address.postal_code === shippingAddress?.postal_code &&
      address.city === shippingAddress?.city
  )
  const manualAddress =
    !matchingAddress && shippingAddress?.address_1
      ? shippingAddress
      : undefined
  const initialMode = manualAddress || !hasSaved ? "new" : "select"

  const [mode, setMode] = useState(initialMode)
  const [selectedId, setSelectedId] = useState(matchingAddress?.id)
  const [company, setCompany] = useState(manualAddress?.company ?? "")
  const [addressFields, setAddressFields] = useState<AddressFields>({
    address_1: manualAddress?.address_1 ?? "",
    postal_code: manualAddress?.postal_code ?? "",
    city: manualAddress?.city ?? "",
    province: manualAddress?.province ?? "",
  })
  const [error, setError] = useState<string | null>(null)
  // Its own state, not `error`: `ErrorMessage` runs whatever it is given through
  // `resolveErrorKey`, which maps a BACKEND error string onto one of the fixed
  // `Errors.*` keys — an already-translated sentence handed to it comes out as
  // the generic message (measured on the f04 stand, 2026-09-15: the sheet
  // rendered nothing a customer could act on).
  const [addressGaps, setAddressGaps] = useState<ShippingAddressField[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [applyingId, setApplyingId] = useState<string | null>(null)

  // `AddressAutocomplete` picks between two providers and forwards no ref of
  // its own, so this focuses the region itself rather than one input inside
  // it — a `tabIndex={-1}` container is the usual way to land focus on a
  // group with no single obvious first control, and Tab from here still
  // reaches the real first field next. A callback ref, because the two
  // branches below root in a `<div>` or a `<form>` and a plain `RefObject`
  // can only ever be typed to one of them.
  const containerElRef = useRef<HTMLElement | null>(null)
  const setContainerRef = (node: HTMLElement | null) => {
    containerElRef.current = node
  }
  useEffect(() => {
    if (autoFocus) containerElRef.current?.focus()
  }, [autoFocus])

  const countryName = (code?: string | null) =>
    cart.region?.countries?.find((c) => c.iso_2 === code?.toLowerCase())
      ?.display_name ||
    code?.toUpperCase() ||
    ""

  const formatAddress = (address: HttpTypes.StoreCustomerAddress) =>
    [
      address.postal_code,
      countryName(address.country_code),
      address.city,
      address.address_1,
    ]
      .filter(Boolean)
      .join(", ")

  async function applySaved(address: HttpTypes.StoreCustomerAddress) {
    // f04-address-without-city: an address saved before this rule existed can
    // itself be missing a city, and applying it would put the cart back in the
    // state the fix exists to prevent.
    const savedGaps = shippingAddressGaps(address, address.country_code)
    if (savedGaps.length > 0) {
      setSelectedId(undefined)
      setAddressGaps(savedGaps)
      return
    }
    setApplyingId(address.id)
    setError(null)
    setAddressGaps([])
    const result = await setAddresses({
      shipping_address: {
        company: address.company ?? undefined,
        address_1: address.address_1 ?? undefined,
        postal_code: address.postal_code ?? undefined,
        city: address.city ?? undefined,
        province: address.province ?? undefined,
        country_code: address.country_code ?? undefined,
      },
    })
    if (result) {
      setError(result)
      setApplyingId(null)
      return
    }
    setApplyingId(null)
    onSaved()
    if (
      address.country_code &&
      address.country_code !== shippingAddress?.country_code
    ) {
      await updateRegion(address.country_code, pathname)
    } else {
      router.refresh()
    }
  }

  function handleSelect(value: string) {
    setSelectedId(value)
    const address = savedAddresses.find((address) => address.id === value)
    if (address) applySaved(address)
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // f04-address-without-city: the only gate since the form went `noValidate`
    // (U-08), and the one that survives an autofill, a saved address and a
    // form submitted programmatically. A parcel cannot be posted without city
    // and index, so a half-filled address is never written to the cart.
    const gaps = shippingAddressGaps(addressFields, countryCode)
    if (gaps.length > 0) {
      setAddressGaps(gaps)
      return
    }
    setAddressGaps([])
    setIsSubmitting(true)
    setError(null)
    const result = await setAddresses({
      shipping_address: { ...addressFields, company },
    })
    setIsSubmitting(false)
    if (result) {
      setError(result)
    } else {
      onSaved()
      router.refresh()
    }
  }

  return mode === "select" && hasSaved ? (
    <div className="flex flex-col pt-2" ref={setContainerRef} tabIndex={-1}>
      <RadioGroup
        dir={dir}
        value={selectedId}
        onValueChange={handleSelect}
        disabled={!!applyingId}
        className="flex flex-col gap-[10px]"
      >
        {savedAddresses.map((address) => (
          <RadioGroup.ChoiceBox
            key={address.id}
            value={address.id}
            label={
              address.address_name || address.company || t("fieldAddress")
            }
            description={formatAddress(address)}
          />
        ))}
      </RadioGroup>

      <ErrorMessage error={error} />
      <AddressIncompleteMessage gaps={addressGaps} />

      <div className="flex gap-x-2 mt-4">
        {onCancel && (
          <Button
            type="button"
            onClick={onCancel}
            variant="secondary"
            size="large"
            className="w-full"
          >
            {t("close")}
          </Button>
        )}
        <Button
          type="button"
          onClick={() => setMode("new")}
          size="large"
          className="w-full"
        >
          {t("addNewAddress")}
        </Button>
      </div>
    </div>
  ) : (
    // `noValidate`: the browser's own bubble spoke the browser's language,
    // not the page's, and a required select got no mark (U-08, 46df).
    // `handleSubmit` checks the same fields through `shippingAddressGaps`.
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col pt-2"
      ref={setContainerRef}
      tabIndex={-1}
    >
      <div className="flex flex-col gap-y-3">
        <AddressAutocomplete
          values={addressFields}
          onChange={setAddressFields}
          required
          countryCode={countryCode}
        />
        <Input
          label={t("fieldCompany")}
          name="company"
          autoComplete="organization"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          data-testid="shipping-company-input"
        />
      </div>
      <ErrorMessage error={error} />
      <AddressIncompleteMessage gaps={addressGaps} />
      <div className="flex gap-x-2 mt-4">
        {(hasSaved || onCancel) && (
          <Button
            type="button"
            onClick={() => (hasSaved ? setMode("select") : onCancel?.())}
            variant="secondary"
            size="large"
            className="w-full"
          >
            {hasSaved ? t("back") : t("close")}
          </Button>
        )}
        <Button
          type="submit"
          disabled={isSubmitting}
          size="large"
          className="w-full"
        >
          {isSubmitting ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  )
}
