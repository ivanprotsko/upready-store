"use client"

import { RadioGroup } from "@medusajs/ui"
import RegionOptionRow from "./option-row"
import { awayValueOf, type CountryOption } from "./options"

export type RedirectRow = { country: string; label: string; host: string }

/**
 * The country radio list: the redirect rows first, then the shop's own
 * countries. A redirect row and the visitor's own row of the same country sit
 * side by side with distinct values and ids (t-2026-10-20-22, return 1).
 */
const CountryList = ({
  dir,
  value,
  onValueChange,
  disabled,
  redirectRows,
  countryRows,
}: {
  dir?: "ltr" | "rtl"
  value?: string
  onValueChange: (value: string) => void
  disabled?: boolean
  redirectRows: RedirectRow[]
  countryRows: CountryOption[]
}) => (
  <RadioGroup
    dir={dir}
    value={value}
    onValueChange={onValueChange}
    disabled={disabled}
    className="gap-1"
  >
    {redirectRows.map((opt) => (
      <RegionOptionRow
        key={`away-${opt.country}`}
        id={`region-away-${opt.country}`}
        value={awayValueOf(opt.country)}
        label={opt.label}
        description={opt.host}
        flagCode={opt.country.toUpperCase()}
      />
    ))}
    {countryRows.map((opt) => (
      <RegionOptionRow
        key={opt.country}
        id={`region-country-${opt.country}`}
        value={opt.country}
        label={opt.label}
        description={opt.currencyCode}
        flagCode={opt.country.toUpperCase()}
      />
    ))}
  </RadioGroup>
)

export default CountryList
