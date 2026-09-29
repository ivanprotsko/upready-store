"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { usePathname, useRouter } from "next/navigation"
import { setAddresses, updateRegion } from "@lib/data/cart"
import type { HttpTypes } from "@medusajs/types"
import Input from "@modules/common/components/input"
import { CheckoutModal } from "@modules/checkout/components/checkout-modal"
import ErrorMessage from "@modules/checkout/components/error-message"
import { useTranslations } from "next-intl"
import AddressAutocomplete, {
  type AddressFields,
} from "@modules/common/components/address-autocomplete"
import { Button, RadioGroup } from "@medusajs/ui"
import { useLocaleDirection } from "@lib/hooks/use-locale-direction"
import {
  addressGapMessageKeys,
  cartCountryCode,
  shippingAddressGaps,
  type ShippingAddressField,
} from "@lib/util/shipping-address"

/**
 * The sentences a customer can act on when the address cannot be posted: the
 * general one for street, city and index, and one of its own for the province
 * (U-08, 46df UX audit).
 */
function AddressIncompleteMessage({ gaps }: { gaps: ShippingAddressField[] }) {
  const t = useTranslations("CheckoutPage")
  const keys = addressGapMessageKeys(gaps)
  if (keys.length === 0) return null
  return (
    <div
      role="alert"
      className="pt-2 flex flex-col gap-y-1 text-rose-500 text-small-regular"
      data-testid="address-incomplete-message"
    >
      {keys.map((key) => (
        <span key={key}>{t(key)}</span>
      ))}
    </div>
  )
}

interface CheckoutAddressSheetProps {
  open: boolean
  onClose: () => void
  cart: HttpTypes.StoreCart
  customer: HttpTypes.StoreCustomer | null
  addresses: HttpTypes.StoreCustomerAddress[] | null
}

export default function CheckoutAddressSheet({
  open,
  onClose,
  cart,
  addresses,
}: CheckoutAddressSheetProps) {
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

  /**
   * The sheet is seeded from the cart when it OPENS, and never again while it
   * stays open.
   *
   * It used to re-seed on every change of `cart` (the dependencies below are
   * all derived from it), which made the checkout's own `router.refresh()` a
   * race: the refresh is an RSC round trip that lands whenever the network
   * decides, and the new cart object then wiped whatever the customer had typed
   * in the meantime — measured 2026-09-16 on the i03 stand, where a city typed
   * into the open sheet reverted to the cart's saved one a few seconds later
   * (rule 19h: an async answer must not own state the customer has touched).
   * A cart that changes while the sheet is open is never newer than the form in
   * front of the customer.
   */
  const wasOpen = useRef(false)
  useEffect(() => {
    if (!open) {
      wasOpen.current = false
      return
    }
    if (wasOpen.current) return
    wasOpen.current = true

    setMode(initialMode)
    setSelectedId(matchingAddress?.id)
    setAddressFields({
      address_1: manualAddress?.address_1 ?? "",
      postal_code: manualAddress?.postal_code ?? "",
      city: manualAddress?.city ?? "",
      province: manualAddress?.province ?? "",
    })
    setCompany(manualAddress?.company ?? "")
    setError(null)
    setAddressGaps([])
  }, [open, initialMode, matchingAddress, manualAddress])

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
    onClose()
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
      onClose()
      router.refresh()
    }
  }

  return (
    <CheckoutModal open={open} onClose={onClose} title={t("addressModalTitle")}>
      {mode === "select" && hasSaved ? (
        <div className="flex flex-col">
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

          <Button
            type="button"
            onClick={() => setMode("new")}
            size="large"
            className="w-full mt-4"
          >
            {t("addNewAddress")}
          </Button>
        </div>
      ) : (
        // `noValidate`: the browser's own bubble spoke the browser's language,
        // not the page's, and a required select got no mark (U-08, 46df).
        // `handleSubmit` checks the same fields through `shippingAddressGaps`.
        <form onSubmit={handleSubmit} noValidate className="flex flex-col">
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
            <Button
              type="button"
              onClick={() => (hasSaved ? setMode("select") : onClose())}
              variant="secondary"
              size="large"
              className="w-full"
            >
              {hasSaved ? t("back") : t("close")}
            </Button>
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
      )}
    </CheckoutModal>
  )
}
