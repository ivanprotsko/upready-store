export type AddressFields = {
  address_1: string
  postal_code: string
  city: string
  province: string
}

export type AddressAutocompleteProps = {
  values: AddressFields
  onChange: (fields: AddressFields) => void
  required?: boolean
  /** ISO-2 country of the cart's shipping address; the manual form offers a region select for countries that have a list (ru). */
  countryCode?: string | null
}
