"use client"

import { XMarkMini } from "@medusajs/icons"
import { clx } from "@medusajs/ui"
import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"

import { formatRangeValue, parseRangeValue } from "@lib/util/product-attribute-filters"

/**
 * The «от … до …» control of a numeric characteristic (t15-product-attributes).
 *
 * Two number fields rather than a slider: the buyer of a supplement types «от
 * 100», and a slider over an unknown span cannot be typed into. The span the
 * shop actually carries is the placeholder of each field, so an empty control
 * still says what exists.
 *
 * Applying happens on blur and on Enter, never on every keystroke: each apply
 * is a navigation, and re-running the listing per digit would make the field
 * unusable.
 */
const RangeFilter = ({
  label,
  unit,
  min,
  max,
  value,
  onChange,
  bare = false,
}: {
  label: string
  unit: string | null
  min: number
  max: number
  value: string | undefined
  onChange: (value: string) => void
  /** The sidebar names the range in its group heading, so the field drops its own caption. */
  bare?: boolean
}) => {
  const t = useTranslations("Filters")
  // «Очистить» already exists once, in Common — no second copy of the word.
  const tCommon = useTranslations("Common")
  const selected = parseRangeValue(value)

  const [from, setFrom] = useState(selected.min === null ? "" : String(selected.min))
  const [to, setTo] = useState(selected.max === null ? "" : String(selected.max))

  // The URL is the state of record: a Back, a chip cleared elsewhere or a
  // fresh render must reach the fields. `value` changes only on navigation, so
  // this never fights the typing in between.
  const applied = useRef(value)
  useEffect(() => {
    if (applied.current === value) {
      return
    }
    applied.current = value
    const next = parseRangeValue(value)
    setFrom(next.min === null ? "" : String(next.min))
    setTo(next.max === null ? "" : String(next.max))
  }, [value])

  const commit = () => {
    const toNumber = (raw: string) => {
      const trimmed = raw.trim().replace(",", ".")
      if (trimmed === "") {
        return null
      }
      const parsed = Number(trimmed)
      return Number.isFinite(parsed) ? parsed : null
    }

    const next = formatRangeValue(toNumber(from), toNumber(to))
    if (next !== (value ?? "")) {
      applied.current = next
      onChange(next)
    }
  }

  const hasValue = selected.min !== null || selected.max !== null

  const fieldClassName =
    "txt-compact-small text-ui-fg-base w-14 bg-transparent text-center outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] tabular-nums placeholder:text-ui-fg-muted"

  return (
    <div
      className={clx(
        "flex h-8 items-center gap-x-1 rounded-md px-2",
        "bg-ui-bg-base transition-fg shadow-borders-base",
        "has-[input:focus]:shadow-borders-field-focus"
      )}
      data-testid={`range-filter-${label}`}
    >
      {bare ? null : (
        <span className="txt-compact-small text-ui-fg-subtle whitespace-nowrap">
          {unit ? `${label}, ${unit}` : label}
        </span>
      )}
      <input
        type="number"
        inputMode="decimal"
        aria-label={`${label} — ${t("from")}`}
        placeholder={String(min)}
        value={from}
        onChange={(event) => setFrom(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur()
          }
        }}
        className={fieldClassName}
      />
      <span className="txt-compact-small text-ui-fg-muted">—</span>
      <input
        type="number"
        inputMode="decimal"
        aria-label={`${label} — ${t("to")}`}
        placeholder={String(max)}
        value={to}
        onChange={(event) => setTo(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur()
          }
        }}
        className={fieldClassName}
      />
      {hasValue ? (
        <button
          type="button"
          aria-label={`${label} — ${tCommon("clear")}`}
          onClick={() => {
            setFrom("")
            setTo("")
            applied.current = ""
            onChange("")
          }}
          className="text-ui-fg-muted hover:text-ui-fg-base transition-fg flex size-5 items-center justify-center rounded"
        >
          <XMarkMini />
        </button>
      ) : null}
    </div>
  )
}

export default RangeFilter
