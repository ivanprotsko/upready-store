"use client"

import {
  Dialog,
  DialogPanel,
  Transition,
  TransitionChild,
} from "@headlessui/react"
import {
  Funnel,
  XMark,
  ChevronRightMini,
  ChevronLeftMini,
} from "@medusajs/icons"
import { Checkbox, RadioGroup } from "@medusajs/ui"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"

import {
  OPTION_VALUE_QUERY_KEY,
  parseOptionValueIds,
} from "@lib/util/product-option-filters"
import type { ProductOptionFilterGroup } from "@lib/util/option-filter-groups"
import type { AttributeFacet } from "@lib/data/product-attributes"
import {
  applyAttributeValues,
  formatRangeValue,
  parseAttributeSelection,
  parseRangeValue,
} from "@lib/util/product-attribute-filters"
import type { SortOptions } from "../refinement-list/sort-products"
import { useLocaleDirection } from "@lib/hooks/use-locale-direction"

type MobileRefinementProps = {
  sortBy: SortOptions
  optionFilters?: ProductOptionFilterGroup[]
  /** The shop's own characteristics, t15-product-attributes. */
  attributeFacets?: AttributeFacet[]
  className?: string
}

/**
 * The sheet drills one level down: the top level lists sort, the option groups
 * and the shop's characteristics; the second level is one group's values. A
 * numeric characteristic opens on «от … до …» instead of a value list, because
 * a range has no values to tick.
 */
type ActiveFilter =
  | { kind: "option"; id: string }
  | { kind: "attribute"; id: string }

const MobileRefinement = ({
  sortBy,
  optionFilters = [],
  attributeFacets = [],
  className,
}: MobileRefinementProps) => {
  const t = useTranslations()
  const dir = useLocaleDirection()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [open, setOpen] = useState(false)
  const [activeFilter, setActiveFilter] = useState<ActiveFilter | null>(null)

  useEffect(() => {
    if (!open) return

    const mql = window.matchMedia("(min-width: 1024px)")
    const closeOnDesktop = (matches: boolean) => {
      if (matches) {
        setOpen(false)
        setActiveFilter(null)
      }
    }

    closeOnDesktop(mql.matches)
    const handler = (event: MediaQueryListEvent) => closeOnDesktop(event.matches)
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }, [open])

  const updateQueryParams = useCallback(
    (updater: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString())
      updater(params)
      params.delete("page")

      const queryString = params.toString()
      const currentQuery = searchParams.toString()
      const nextPath = queryString ? `${pathname}?${queryString}` : pathname
      const currentPath = currentQuery
        ? `${pathname}?${currentQuery}`
        : pathname

      if (nextPath !== currentPath) {
        router.push(nextPath)
      }
    },
    [pathname, router, searchParams]
  )

  const setSort = (value: string) =>
    updateQueryParams((params) => params.set("sortBy", value))

  const selectedValueIds = useMemo(
    () => new Set(parseOptionValueIds(searchParams)),
    [searchParams]
  )

  const toggleValue = (valueId: string, checked: boolean) =>
    updateQueryParams((params) => {
      const current = new Set(parseOptionValueIds(searchParams))
      if (checked) {
        current.add(valueId)
      } else {
        current.delete(valueId)
      }
      params.delete(OPTION_VALUE_QUERY_KEY)
      current.forEach((id) => params.append(OPTION_VALUE_QUERY_KEY, id))
    })

  const sortOptions = [
    { value: "created_at", label: t("SortSelect.latestArrivals") },
    { value: "price_asc", label: t("SortSelect.priceLowHigh") },
    { value: "price_desc", label: t("SortSelect.priceHighLow") },
  ]

  const attributeSelection = useMemo(
    () => parseAttributeSelection(searchParams),
    [searchParams]
  )

  const setAttributeValues = (key: string, values: string[]) =>
    updateQueryParams((params) => applyAttributeValues(params, key, values))

  const toggleAttributeValue = (key: string, value: string, checked: boolean) => {
    const current = new Set(attributeSelection[key] ?? [])
    if (checked) {
      current.add(value)
    } else {
      current.delete(value)
    }
    setAttributeValues(key, Array.from(current))
  }

  const groups = optionFilters.filter((group) => group.values.length > 0)
  const facets = attributeFacets.filter(
    (facet) => facet.values.length > 0 || facet.range !== null
  )

  const activeGroup =
    activeFilter?.kind === "option"
      ? (groups.find((group) => group.id === activeFilter.id) ?? null)
      : null
  const activeFacet =
    activeFilter?.kind === "attribute"
      ? (facets.find((facet) => facet.key === activeFilter.id) ?? null)
      : null

  /** A yes/no is stored as `true`/`false` and never reaches the screen that way. */
  const facetValueLabel = (facet: AttributeFacet, value: string, label: string) =>
    facet.type === "boolean"
      ? value === "true"
        ? t("Filters.yes")
        : t("Filters.no")
      : label

  const close = () => {
    setOpen(false)
    setActiveFilter(null)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("Filters.title")}
        className={className}
      >
        <Funnel />
      </button>

      <Transition show={open}>
        <Dialog onClose={close} className="relative z-50">
          <TransitionChild
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div
              className="fixed inset-0 bg-ui-bg-overlay backdrop-blur-[2px]"
              aria-hidden="true"
            />
          </TransitionChild>

          <div className="fixed inset-0 flex items-end justify-center">
            <TransitionChild
              enter="ease-out duration-250"
              enterFrom="opacity-0 translate-y-8"
              enterTo="opacity-100 translate-y-0"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0"
              leaveTo="opacity-0 translate-y-8"
            >
              <DialogPanel className="relative flex w-full flex-col h-[85dvh] bg-ui-bg-base rounded-t-xl shadow-elevation-modal">
                <div className="flex shrink-0 items-center justify-between px-6 pt-6 pb-3">
                  {activeGroup || activeFacet ? (
                    <button
                      type="button"
                      onClick={() => setActiveFilter(null)}
                      className="flex items-center gap-3 text-ui-fg-base"
                    >
                      <ChevronLeftMini className="rtl:rotate-180" />
                      <span className="txt-xlarge">
                        {activeGroup ? activeGroup.title : activeFacet?.name}
                      </span>
                    </button>
                  ) : (
                    <span className="txt-xlarge text-ui-fg-base">
                      {t("Filters.title")}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={close}
                    aria-label={t("Common.close")}
                    className="p-0.5 text-ui-fg-muted hover:text-ui-fg-base transition-colors"
                  >
                    <XMark />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 pb-8">
                  {activeGroup ? (
                    <div className="flex flex-col gap-4 pt-2">
                      {activeGroup.values.map((value) => (
                        <label
                          key={value.id}
                          htmlFor={`filter-${value.id}`}
                          className="flex cursor-pointer items-center gap-4"
                        >
                          <Checkbox
                            id={`filter-${value.id}`}
                            checked={selectedValueIds.has(value.id)}
                            onCheckedChange={(checked) =>
                              toggleValue(value.id, checked === true)
                            }
                          />
                          <span className="txt-compact-large text-ui-fg-base">
                            {value.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : activeFacet ? (
                    activeFacet.type === "number" && activeFacet.range ? (
                      <MobileRangeFields
                        facet={activeFacet}
                        value={attributeSelection[activeFacet.key]?.[0]}
                        onChange={(value) =>
                          setAttributeValues(
                            activeFacet.key,
                            value ? [value] : []
                          )
                        }
                        fromLabel={t("Filters.from")}
                        toLabel={t("Filters.to")}
                      />
                    ) : (
                      <div className="flex flex-col gap-4 pt-2">
                        {activeFacet.values.map((value) => (
                          <label
                            key={value.value}
                            htmlFor={`attr-${activeFacet.key}-${value.value}`}
                            className="flex cursor-pointer items-center gap-4"
                          >
                            <Checkbox
                              id={`attr-${activeFacet.key}-${value.value}`}
                              disabled={value.disabled}
                              checked={(
                                attributeSelection[activeFacet.key] ?? []
                              ).includes(value.value)}
                              onCheckedChange={(checked) =>
                                toggleAttributeValue(
                                  activeFacet.key,
                                  value.value,
                                  checked === true
                                )
                              }
                            />
                            <span
                              className={
                                value.disabled
                                  ? "txt-compact-large text-ui-fg-disabled"
                                  : "txt-compact-large text-ui-fg-base"
                              }
                            >
                              {facetValueLabel(activeFacet, value.value, value.label)}
                            </span>
                            <span className="ms-auto txt-compact-small text-ui-fg-muted tabular-nums">
                              {value.count}
                            </span>
                          </label>
                        ))}
                      </div>
                    )
                  ) : (
                    <>
                      <p className="mb-3 txt-compact-small text-ui-fg-subtle">
                        {t("Filters.sort")}
                      </p>
                      <RadioGroup dir={dir} value={sortBy} onValueChange={setSort}>
                        <div className="flex flex-col gap-3">
                          {sortOptions.map((option) => (
                            <label
                              key={option.value}
                              htmlFor={`sort-${option.value}`}
                              className="flex cursor-pointer items-center gap-3"
                            >
                              <RadioGroup.Item
                                id={`sort-${option.value}`}
                                value={option.value}
                              />
                              <span className="txt-compact-medium text-ui-fg-base">
                                {option.label}
                              </span>
                            </label>
                          ))}
                        </div>
                      </RadioGroup>

                      {groups.length > 0 || facets.length > 0 ? (
                        <div className="mt-6 flex flex-col">
                          {groups.map((group) => (
                            <button
                              key={group.id}
                              type="button"
                              onClick={() =>
                                setActiveFilter({ kind: "option", id: group.id })
                              }
                              className="flex items-center justify-between py-2 text-ui-fg-base"
                            >
                              <span className="txt-large">
                                {group.title}
                              </span>
                              <ChevronRightMini className="text-ui-fg-muted rtl:rotate-180" />
                            </button>
                          ))}
                          {facets.map((facet) => (
                            <button
                              key={facet.key}
                              type="button"
                              onClick={() =>
                                setActiveFilter({ kind: "attribute", id: facet.key })
                              }
                              className="flex items-center justify-between py-2 text-ui-fg-base"
                            >
                              <span className="txt-large">
                                {facet.unit
                                  ? `${facet.name}, ${facet.unit}`
                                  : facet.name}
                              </span>
                              <ChevronRightMini className="text-ui-fg-muted rtl:rotate-180" />
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </Dialog>
      </Transition>
    </>
  )
}

/**
 * «от … до …» inside the sheet. Applied on blur, never per keystroke: each
 * apply is a navigation and the sheet would close under the finger.
 */
const MobileRangeFields = ({
  facet,
  value,
  onChange,
  fromLabel,
  toLabel,
}: {
  facet: AttributeFacet
  value: string | undefined
  onChange: (value: string) => void
  fromLabel: string
  toLabel: string
}) => {
  const selected = parseRangeValue(value)
  const [from, setFrom] = useState(selected.min === null ? "" : String(selected.min))
  const [to, setTo] = useState(selected.max === null ? "" : String(selected.max))

  const toNumber = (raw: string) => {
    const trimmed = raw.trim().replace(",", ".")
    if (trimmed === "") {
      return null
    }
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }

  const commit = () => {
    const next = formatRangeValue(toNumber(from), toNumber(to))
    if (next !== (value ?? "")) {
      onChange(next)
    }
  }

  const fieldClassName =
    "txt-compact-large text-ui-fg-base h-10 w-full rounded-md bg-ui-bg-field px-3 outline-none tabular-nums shadow-borders-base"

  return (
    <div className="flex items-end gap-3 pt-2">
      <label className="flex flex-1 flex-col gap-1">
        <span className="txt-compact-small text-ui-fg-subtle">{fromLabel}</span>
        <input
          type="number"
          inputMode="decimal"
          placeholder={String(facet.range?.min ?? "")}
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          onBlur={commit}
          className={fieldClassName}
        />
      </label>
      <label className="flex flex-1 flex-col gap-1">
        <span className="txt-compact-small text-ui-fg-subtle">{toLabel}</span>
        <input
          type="number"
          inputMode="decimal"
          placeholder={String(facet.range?.max ?? "")}
          value={to}
          onChange={(event) => setTo(event.target.value)}
          onBlur={commit}
          className={fieldClassName}
        />
      </label>
    </div>
  )
}

export default MobileRefinement
