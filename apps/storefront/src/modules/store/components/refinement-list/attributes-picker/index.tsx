"use client"

import { useTranslations } from "next-intl"

import type { AttributeFacet } from "@lib/data/product-attributes"
import type { AttributeSelection } from "@lib/util/product-attribute-filters"
import FilterCombobox from "../filter-combobox"
import RangeFilter from "./range-filter"

/**
 * The shop's own characteristics as catalogue filters (t15-product-attributes),
 * standing NEXT TO the option chips rather than replacing them: an option is a
 * variant's own choice (size, colour), a characteristic describes the product.
 *
 * Counts come from the backend, computed over the whole catalogue with the
 * other facets applied and this one's own selection left out — so picking
 * «травы» still shows how many «витамины» there are. A value that matches
 * nothing under the current selection arrives `disabled`, and is rendered
 * disabled rather than dropped: a filter that hides what it cannot offer
 * leaves the buyer guessing what the shop has.
 */
const AttributesPicker = ({
  facets,
  selection,
  setAttributeValues,
}: {
  facets: AttributeFacet[]
  selection: AttributeSelection
  setAttributeValues: (key: string, values: string[]) => void
}) => {
  const t = useTranslations("Filters")

  if (!facets.length) {
    return null
  }

  return (
    <div className="flex flex-row flex-wrap gap-2">
      {facets.map((facet) => {
        if (facet.type === "number") {
          if (!facet.range) {
            return null
          }
          return (
            <RangeFilter
              key={facet.key}
              label={facet.name}
              unit={facet.unit}
              min={facet.range.min}
              max={facet.range.max}
              value={selection[facet.key]?.[0]}
              onChange={(value) =>
                setAttributeValues(facet.key, value ? [value] : [])
              }
            />
          )
        }

        if (!facet.values.length) {
          return null
        }

        const selected = selection[facet.key] ?? []

        return (
          <FilterCombobox
            className="max-w-[220px]"
            key={facet.key}
            label={facet.unit ? `${facet.name}, ${facet.unit}` : facet.name}
            value={selected}
            onChange={(values) => setAttributeValues(facet.key, values)}
            options={facet.values.map((value) => ({
              value: value.value,
              // A yes/no is stored as `true`/`false` and must never reach a
              // screen that way.
              label:
                facet.type === "boolean"
                  ? value.value === "true"
                    ? t("yes")
                    : t("no")
                  : value.label,
              count: value.count,
              disabled: value.disabled,
            }))}
            allowClear={selected.length > 0}
          />
        )
      })}
    </div>
  )
}

export default AttributesPicker
