import { HttpTypes } from "@medusajs/types"
import i18n from "i18next"

import { countries, getCountryByIso2 } from "./data/countries"

/**
 * The static `countries` list and the API's `address.country.display_name`
 * both carry English-only names ("Russian Federation" for `ru`). Rather than
 * translate a 250-entry list by hand, ask the browser's own ICU data for the
 * name in the active language, e.g. `Intl.DisplayNames(["ru"], { type:
 * "region" }).of("RU")` returns "Россия". Falls back to the static English
 * name when the runtime lacks `Intl.DisplayNames` or the code is unknown.
 */
const getLocalizedCountryName = (
  countryCode?: string | null
): string | undefined => {
  if (!countryCode) {
    return undefined
  }

  try {
    return new Intl.DisplayNames([i18n.language], { type: "region" }).of(
      countryCode.toUpperCase()
    )
  } catch {
    return undefined
  }
}

export const isSameAddress = (
  a?: HttpTypes.AdminOrderAddress | null,
  b?: HttpTypes.AdminOrderAddress | null
) => {
  if (!a || !b) {
    return false
  }

  return (
    a.first_name === b.first_name &&
    a.last_name === b.last_name &&
    a.address_1 === b.address_1 &&
    a.address_2 === b.address_2 &&
    a.city === b.city &&
    a.postal_code === b.postal_code &&
    a.province === b.province &&
    a.country_code === b.country_code
  )
}

export const getFormattedAddress = ({
  address,
}: {
  address?: HttpTypes.AdminOrderAddress | null
}) => {
  if (!address) {
    return []
  }

  const {
    first_name,
    last_name,
    company,
    address_1,
    address_2,
    city,
    postal_code,
    province,
    country,
    country_code,
  } = address

  const name = [first_name, last_name].filter(Boolean).join(" ")

  const formattedAddress: string[] = []

  if (name) {
    formattedAddress.push(name)
  }

  if (company) {
    formattedAddress.push(company)
  }

  if (address_1) {
    formattedAddress.push(address_1)
  }

  if (address_2) {
    formattedAddress.push(address_2)
  }

  const cityProvincePostal = [city, province, postal_code]
    .filter(Boolean)
    .join(" ")

  if (cityProvincePostal) {
    formattedAddress.push(cityProvincePostal)
  }

  const localizedCountryName = getLocalizedCountryName(
    country_code ?? country?.iso_2
  )

  if (localizedCountryName) {
    formattedAddress.push(localizedCountryName)
  } else if (country) {
    formattedAddress.push(country.display_name!)
  } else if (country_code) {
    const country = getCountryByIso2(country_code)

    if (country) {
      formattedAddress.push(country.display_name)
    } else {
      formattedAddress.push(country_code.toUpperCase())
    }
  }

  return formattedAddress
}

export const getFormattedCountry = (countryCode: string | null | undefined) => {
  if (!countryCode) {
    return ""
  }

  const localizedCountryName = getLocalizedCountryName(countryCode)
  if (localizedCountryName) {
    return localizedCountryName
  }

  const country = countries.find((c) => c.iso_2 === countryCode)
  return country ? country.display_name : countryCode
}
