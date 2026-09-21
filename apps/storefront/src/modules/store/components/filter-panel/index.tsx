"use client"

import { ChevronDownMini, XMarkMini } from "@medusajs/icons"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useMemo } from "react"

import type { AttributeFacet } from "@lib/data/product-attributes"
import type { ProductOptionFilterGroup } from "@lib/util/option-filter-groups"
import {
  ATTRIBUTE_PARAM_PREFIX,
  applyAttributeValues,
  parseAttributeSelection,
  parseRangeValue,
} from "@lib/util/product-attribute-filters"
import { OPTION_VALUE_QUERY_KEY, parseOptionValueIds } from "@lib/util/product-option-filters"
import RangeFilter from "@modules/store/components/refinement-list/attributes-picker/range-filter"

/**
 * The catalog's filters as a visitor reads them: collapsible groups of checkboxes in the
 * left column, under the categories, and the chosen values as removable chips over the grid.
 *
 * The URL stays the only state, in the same parameters the comboboxes wrote (`ov` value
 * ids, `a_<key>` characteristics, `min..max` ranges), so every old deep link still opens
 * the same selection.
 *
 * What is not a choice is not shown: a group with a single value narrows nothing, and a
 * range whose ends coincide has nothing to drag. Inside one option group the same label can
 * come from several products' own options (one value id each); a visitor sees it once, and
 * the checkbox drives all of its ids together.
 */
type FilterPanelProps = {
  optionFilters?: ProductOptionFilterGroup[]
  attributeFacets?: AttributeFacet[]
}

type LabelBucket = { label: string; ids: string[] }

const bucketsOf = (group: ProductOptionFilterGroup): LabelBucket[] => {
  const byLabel = new Map<string, LabelBucket>()
  for (const value of group.values) {
    const key = value.label.trim().toLowerCase()
    const bucket = byLabel.get(key)
    if (bucket) {
      bucket.ids.push(value.id)
    } else {
      byLabel.set(key, { label: value.label.trim(), ids: [value.id] })
    }
  }
  return Array.from(byLabel.values())
}

const useFilterQuery = () => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const update = useCallback(
    (updater: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString())
      updater(params)
      params.delete("page")
      const query = params.toString()
      if (query !== searchParams.toString()) {
        router.push(query ? `${pathname}?${query}` : pathname, { scroll: false })
      }
    },
    [pathname, router, searchParams]
  )

  const optionIds = useMemo(() => parseOptionValueIds(searchParams), [searchParams])
  const attributes = useMemo(() => parseAttributeSelection(searchParams), [searchParams])

  const setOptionIds = (ids: string[]) =>
    update((params) => {
      params.delete(OPTION_VALUE_QUERY_KEY)
      ids.forEach((id) => params.append(OPTION_VALUE_QUERY_KEY, id))
    })

  const setAttribute = (key: string, values: string[]) =>
    update((params) => applyAttributeValues(params, key, values))

  const resetAll = () =>
    update((params) => {
      params.delete(OPTION_VALUE_QUERY_KEY)
      for (const name of Array.from(params.keys())) {
        if (name.startsWith(ATTRIBUTE_PARAM_PREFIX)) params.delete(name)
      }
    })

  return { optionIds, attributes, setOptionIds, setAttribute, resetAll }
}

const CHECKBOX =
  "size-4 shrink-0 rounded border-ui-border-strong accent-[var(--primary,#111)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-border-interactive"

const Group = ({
  title,
  testId,
  children,
}: {
  title: string
  testId: string
  children: React.ReactNode
}) => (
  <details open className="group/filter border-b border-ui-border-base py-3" data-testid={testId}>
    <summary className="flex cursor-pointer list-none items-center justify-between gap-x-2 rounded txt-compact-small-plus text-ui-fg-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-border-interactive [&::-webkit-details-marker]:hidden">
      <span>{title}</span>
      <ChevronDownMini
        aria-hidden
        className="shrink-0 text-ui-fg-muted transition-transform group-open/filter:rotate-180"
      />
    </summary>
    <div className="flex max-h-64 flex-col gap-y-2 overflow-y-auto p-0.5 pt-3">{children}</div>
  </details>
)

export const FilterSidebar = ({ optionFilters = [], attributeFacets = [] }: FilterPanelProps) => {
  const t = useTranslations("Filters")
  const { optionIds, attributes, setOptionIds, setAttribute } = useFilterQuery()

  const optionGroups = optionFilters
    .map((group) => ({ group, buckets: bucketsOf(group) }))
    .filter(({ buckets }) => buckets.length > 1)
  const facets = attributeFacets.filter((facet) =>
    facet.type === "number"
      ? Boolean(facet.range && facet.range.min !== facet.range.max)
      : facet.values.length > 1
  )

  if (!optionGroups.length && !facets.length) {
    return null
  }

  return (
    <div className="flex flex-col" data-testid="filter-sidebar" aria-label={t("title")} role="group">
      <span className="border-b border-ui-border-base pb-3 txt-compact-medium-plus text-ui-fg-base">
        {t("title")}
      </span>

      {optionGroups.map(({ group, buckets }) => (
        <Group key={group.id} title={group.title} testId={`filter-group-option-${group.id}`}>
          {buckets.map((bucket) => {
            const checked = bucket.ids.some((id) => optionIds.includes(id))
            return (
              <label key={bucket.label} className="flex cursor-pointer items-center gap-x-2 txt-compact-small text-ui-fg-subtle hover:text-ui-fg-base">
                <input
                  type="checkbox"
                  className={CHECKBOX}
                  checked={checked}
                  onChange={() =>
                    setOptionIds(
                      checked
                        ? optionIds.filter((id) => !bucket.ids.includes(id))
                        : [...optionIds, ...bucket.ids]
                    )
                  }
                />
                <span className="min-w-0 break-words">{bucket.label}</span>
              </label>
            )
          })}
        </Group>
      ))}

      {facets.map((facet) => {
        if (facet.type === "number" && facet.range) {
          const unit = facet.unit ? ` ${facet.unit}` : ""
          return (
            <Group
              key={facet.key}
              title={`${facet.name}: ${t("from")} ${facet.range.min} ${t("to")} ${facet.range.max}${unit}`}
              testId={`filter-group-${facet.key}`}
            >
              <RangeFilter
                bare
                label={facet.name}
                unit={facet.unit}
                min={facet.range.min}
                max={facet.range.max}
                value={attributes[facet.key]?.[0]}
                onChange={(value) => setAttribute(facet.key, value ? [value] : [])}
              />
            </Group>
          )
        }

        const selected = attributes[facet.key] ?? []
        return (
          <Group
            key={facet.key}
            title={facet.unit ? `${facet.name}, ${facet.unit}` : facet.name}
            testId={`filter-group-${facet.key}`}
          >
            {facet.values.map((value) => {
              const checked = selected.includes(value.value)
              const label =
                facet.type === "boolean" ? (value.value === "true" ? t("yes") : t("no")) : value.label
              return (
                <label
                  key={value.value}
                  className={`flex items-center gap-x-2 txt-compact-small ${
                    value.disabled && !checked
                      ? "cursor-not-allowed text-ui-fg-disabled"
                      : "cursor-pointer text-ui-fg-subtle hover:text-ui-fg-base"
                  }`}
                >
                  <input
                    type="checkbox"
                    className={CHECKBOX}
                    checked={checked}
                    disabled={value.disabled && !checked}
                    onChange={() =>
                      setAttribute(
                        facet.key,
                        checked ? selected.filter((item) => item !== value.value) : [...selected, value.value]
                      )
                    }
                  />
                  <span className="min-w-0 flex-1 break-words">{label}</span>
                  <span className="tabular-nums text-ui-fg-muted">{value.count}</span>
                </label>
              )
            })}
          </Group>
        )
      })}
    </div>
  )
}

export const ActiveFilters = ({ optionFilters = [], attributeFacets = [] }: FilterPanelProps) => {
  const t = useTranslations("Filters")
  const tCommon = useTranslations("Common")
  const { optionIds, attributes, setOptionIds, setAttribute, resetAll } = useFilterQuery()

  const chips: { key: string; label: string; remove: () => void }[] = []

  for (const group of optionFilters) {
    for (const bucket of bucketsOf(group)) {
      if (bucket.ids.some((id) => optionIds.includes(id))) {
        chips.push({
          key: `${group.id}:${bucket.label}`,
          label: `${group.title}: ${bucket.label}`,
          remove: () => setOptionIds(optionIds.filter((id) => !bucket.ids.includes(id))),
        })
      }
    }
  }

  for (const facet of attributeFacets) {
    const selected = attributes[facet.key] ?? []
    if (!selected.length) continue
    if (facet.type === "number") {
      const { min, max } = parseRangeValue(selected[0])
      const unit = facet.unit ? ` ${facet.unit}` : ""
      const parts = [
        min !== null ? `${t("from")} ${min}` : null,
        max !== null ? `${t("to")} ${max}` : null,
      ].filter(Boolean)
      chips.push({
        key: facet.key,
        label: `${facet.name}: ${parts.join(" ")}${unit}`,
        remove: () => setAttribute(facet.key, []),
      })
      continue
    }
    for (const raw of selected) {
      const value = facet.values.find((item) => item.value === raw)
      const label =
        facet.type === "boolean" ? (raw === "true" ? t("yes") : t("no")) : (value?.label ?? raw)
      chips.push({
        key: `${facet.key}:${raw}`,
        label: `${facet.name}: ${label}`,
        remove: () => setAttribute(facet.key, selected.filter((item) => item !== raw)),
      })
    }
  }

  if (!chips.length) {
    return null
  }

  return (
    <ul className="mb-6 flex flex-wrap items-center gap-2" data-testid="active-filters" aria-label={t("title")}>
      {chips.map((chip) => (
        <li key={chip.key}>
          <button
            type="button"
            onClick={chip.remove}
            aria-label={`${tCommon("remove")}: ${chip.label}`}
            data-testid="active-filter-chip"
            className="flex h-8 items-center gap-x-1 rounded-full border border-ui-border-base bg-ui-bg-subtle ps-3 pe-2 txt-compact-small text-ui-fg-base transition-colors hover:border-ui-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-border-interactive"
          >
            <span className="max-w-[240px] truncate">{chip.label}</span>
            <XMarkMini className="shrink-0 text-ui-fg-muted" />
          </button>
        </li>
      ))}
      <li>
        <button
          type="button"
          onClick={resetAll}
          data-testid="active-filters-reset"
          className="h-8 rounded px-2 txt-compact-small-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-border-interactive"
        >
          {t("reset")}
        </button>
      </li>
    </ul>
  )
}

/** How many filters are chosen; the phone's «Фильтры» button shows it as a badge. */
export const useActiveFilterCount = (): number => {
  const { optionIds, attributes } = useFilterQuery()
  return optionIds.length + Object.values(attributes).reduce((sum, values) => sum + values.length, 0)
}
