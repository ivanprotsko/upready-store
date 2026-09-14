"use client"

import type React from "react"
import { useEffect, useState } from "react"
import Input from "@modules/common/components/input"
import NativeSelect from "@modules/common/components/native-select"
import { listShippingRegions, type ShippingRegion } from "@lib/data/fulfillment"
import { useTranslations } from "next-intl"
import type { AddressAutocompleteProps } from "./types"

const ManualAddressFields = ({
  values,
  onChange,
  required,
  countryCode,
}: AddressAutocompleteProps) => {
  const t = useTranslations("CheckoutPage")
  // t04-shipping-tariffs: for a country with a region list (Russia today) the
  // province is picked from the same strings a shop's delivery zone was built
  // from, so a zone restricted to regions matches the typed address exactly.
  // A country without a list keeps the free-text field.
  const [regions, setRegions] = useState<ShippingRegion[]>([])

  useEffect(() => {
    let cancelled = false
    const country = countryCode?.toLowerCase()
    if (!country) {
      setRegions([])
      return
    }
    listShippingRegions(country).then((list) => {
      if (!cancelled) {
        setRegions(list)
      }
    })
    return () => {
      cancelled = true
    }
  }, [countryCode])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    onChange({ ...values, [e.target.name]: e.target.value })
  }

  const provinceInList =
    !values.province || regions.some((region) => region.province === values.province)

  return (
    <>
      <Input
        label={t("fieldAddress")}
        name="address_1"
        autoComplete="address-line1"
        value={values.address_1}
        onChange={handleChange}
        required={required}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label={t("fieldPostalCode")}
          name="postal_code"
          autoComplete="postal-code"
          value={values.postal_code}
          onChange={handleChange}
          required={required}
        />
        <Input
          label={t("fieldCity")}
          name="city"
          autoComplete="address-level2"
          value={values.city}
          onChange={handleChange}
          required={required}
        />
      </div>
      {regions.length > 0 && provinceInList ? (
        <NativeSelect
          name="province"
          autoComplete="address-level1"
          value={values.province}
          onChange={handleChange}
          placeholder={t("fieldProvince")}
          data-testid="address-province-select"
        >
          {regions.map((region) => (
            <option key={region.code} value={region.province}>
              {region.name}
            </option>
          ))}
        </NativeSelect>
      ) : (
        <Input
          label={t("fieldProvince")}
          name="province"
          autoComplete="address-level1"
          value={values.province}
          onChange={handleChange}
        />
      )}
    </>
  )
}

export default ManualAddressFields
