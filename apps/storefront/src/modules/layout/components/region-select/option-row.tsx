"use client"

import CountryFlag from "@modules/common/components/country-flag"
import { RadioGroup } from "@medusajs/ui"

type RegionOptionRowProps = {
  id: string
  value: string
  label: string
  description: string
  flagCode?: string
}

const RegionOptionRow = ({
  id,
  value,
  label,
  description,
  flagCode,
}: RegionOptionRowProps) => {
  return (
    <label
      htmlFor={id}
      className="flex items-center gap-x-3 rounded-lg px-3 py-2 cursor-pointer hover:bg-ui-bg-base-hover transition-colors min-w-0"
    >
      <RadioGroup.Item value={value} id={id} />
      <span className="flex flex-col min-w-0">
        <span className="txt-compact-small text-ui-fg-base truncate">{label}</span>
        <span className="flex items-center gap-x-1.5 txt-compact-xsmall text-ui-fg-subtle truncate">
          {flagCode ? (
            <CountryFlag
              countryCode={flagCode}
              style={{ width: "14px", height: "14px" }}
              className="shrink-0 rounded-sm"
            />
          ) : null}
          {description}
        </span>
      </span>
    </label>
  )
}

export default RegionOptionRow
