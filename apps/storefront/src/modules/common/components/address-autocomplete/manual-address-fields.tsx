"use client"

import type React from "react"
import { useEffect, useState } from "react"
import Input from "@modules/common/components/input"
import NativeSelect from "@modules/common/components/native-select"
import { listShippingRegions, type ShippingRegion } from "@lib/data/fulfillment"
import { fetchCdekCities, type CdekCity } from "@lib/util/cdek"
import SuggestInput from "@modules/common/components/suggest-input"
import { isPostalCodeValid, requiresProvince } from "@lib/util/shipping-address"
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
  // f04-address-without-city: a country whose parcels are addressed by region
  // (Russia today, `COUNTRIES_REQUIRING_PROVINCE`) needs the field filled, and
  // needs it whether the list has arrived yet or not, so the flag comes from
  // the country rather than from `regions.length`.
  const provinceRequired = required && requiresProvince(countryCode)
  // t-2026-10-09-56, item 9: a postcode of the wrong shape (five digits in Russia) is
  // named at the field once the buyer leaves it, and at once for a saved one.
  const [postalTouched, setPostalTouched] = useState(Boolean(values.postal_code))
  const postalInvalid =
    postalTouched && !isPostalCodeValid(values.postal_code, countryCode)
  const russianPostcode = (countryCode ?? "").toLowerCase() === "ru"

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
        <div>
          <Input
            label={t("fieldPostalCode")}
            name="postal_code"
            autoComplete="postal-code"
            inputMode={russianPostcode ? "numeric" : undefined}
            value={values.postal_code}
            onChange={handleChange}
            onBlur={() => setPostalTouched(true)}
            required={required}
            aria-invalid={postalInvalid}
            data-testid="address-postal-code-input"
          />
          {postalInvalid && (
            <p
              className="txt-compact-small text-ui-fg-error pt-1"
              role="alert"
              data-testid="address-postal-code-error"
            >
              {t("postalCodeInvalid")}
            </p>
          )}
        </div>
        {/* i03: the city is the one field of this form a directory we already
            hold can suggest — CDEK's own city list, the same directory every
            later CDEK call resolves against, so a picked city can never be a
            typo the point search then fails on. With CDEK unconfigured
            `fetchCdekCities` answers `[]` and the control is a plain input,
            which is why it needs no feature flag. It fills the city ALONE: the
            province in CDEK's answer is a hierarchy string («городской округ
            Краснодар, Краснодарский край, Россия»), not the canonical province
            the shop's delivery zones are built from, and the select below is
            fed by those exact strings (`listShippingRegions`). */}
        <SuggestInput<CdekCity>
          label={t("fieldCity")}
          name="city"
          autoComplete="address-level2"
          value={values.city}
          onValueChange={(text) => onChange({ ...values, city: text })}
          onPick={(picked) => onChange({ ...values, city: picked.city })}
          fetchItems={fetchCdekCities}
          itemKey={(item) => String(item.code)}
          itemLabel={(item) => item.city}
          itemHint={(item) => item.region}
          required={required}
          testId="address-city-suggest"
        />
      </div>
      {regions.length > 0 && provinceInList ? (
        <NativeSelect
          variant="field"
          name="province"
          autoComplete="address-level1"
          value={values.province}
          onChange={handleChange}
          placeholder={t("fieldProvince")}
          required={provinceRequired}
          data-testid="address-province-select"
        >
          {regions.map((region) => (
            <option key={region.code} value={region.province}>
              {region.name}
            </option>
          ))}
        </NativeSelect>
      ) : (
        // The free-text fallback: no region list for this country, or a saved
        // province that is not in it. It also stands here for the first moments
        // of a country that HAS a list, while `listShippingRegions` is still in
        // flight — its own testid, never the select's, so a test that waits for
        // the select does not accept this input in its place.
        <Input
          label={t("fieldProvince")}
          name="province"
          autoComplete="address-level1"
          value={values.province}
          onChange={handleChange}
          required={provinceRequired}
          data-testid="address-province-input"
        />
      )}
    </>
  )
}

export default ManualAddressFields
