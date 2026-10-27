import { CalendarMini, TriangleDownMini } from "@medusajs/icons"
import { Button, DatePicker, clx } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { rangeShort } from "../../routes/marketplaces/mp-analytics/components/format"
import { PRESETS, asDate, asIsoDay, type Preset } from "./period"

/**
 * The period in the heading row of an analytics page: the ready periods and
 * the two date fields. On a phone it is one chip with the range, as Metrica
 * shrinks its bar; the chip opens the controls under the heading. The ✕ of a
 * field (the picker's own clear button) drops that day from the address, both
 * ✕ give the default period back.
 *
 * Moved here from «Wildberries → Аналитика» so the shop's own analytics page
 * (t-2026-10-20-45) uses the same control instead of a copy.
 */
export const PeriodBar = ({
  from,
  to,
  period,
  activePreset,
  pickPreset,
  setPeriod,
  locale,
}: {
  /** The day the address carries, if any. */
  from: string | undefined
  to: string | undefined
  /** The days the page shows when the address carries none. */
  period: { from_day: string; to_day: string } | undefined
  activePreset: Preset | null
  pickPreset: (preset: Preset) => void
  setPeriod: (from: string | null, to: string | null) => void
  locale: string
}) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const shownFrom = from ?? period?.from_day
  const shownTo = to ?? period?.to_day

  return (
    <>
      <Button
        type="button"
        size="small"
        variant="secondary"
        className="min-h-11 gap-x-1.5 md:hidden"
        aria-expanded={open}
        aria-controls="analytics-period"
        aria-label={t("mp.analytics.v3.period")}
        onClick={() => setOpen((value) => !value)}
        data-testid="analytics-period-chip"
      >
        <CalendarMini className="text-ui-fg-subtle" />
        <span className="tabular-nums">
          {shownFrom && shownTo ? rangeShort(shownFrom, shownTo, locale) : t("mp.analytics.v3.presets.days", { count: 30 })}
        </span>
        <TriangleDownMini className={clx("text-ui-fg-subtle transition-transform", open && "rotate-180")} />
      </Button>
      <div
        id="analytics-period"
        role="group"
        aria-label={t("mp.analytics.v3.period")}
        className={clx("flex flex-wrap items-center gap-2 max-md:w-full", !open && "max-md:hidden")}
        data-testid="analytics-period"
      >
        <div className="bg-ui-bg-subtle flex rounded-md p-0.5 max-md:w-full">
          {[...PRESETS, "month" as const].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                pickPreset(preset)
                setOpen(false)
              }}
              aria-pressed={activePreset === preset}
              className={clx(
                "txt-compact-small-plus text-ui-fg-subtle rounded-[5px] px-3 py-1.5 max-md:min-h-11 max-md:flex-1",
                activePreset === preset && "bg-ui-bg-base text-ui-fg-base shadow-borders-base"
              )}
            >
              {preset === "month" ? t("mp.analytics.v3.presets.month") : t("mp.analytics.v3.presets.days", { count: preset })}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 max-md:w-full [&>*]:max-md:flex-1">
          <DatePicker
            aria-label={t("marketplaceAnalytics.filters.from")}
            value={asDate(shownFrom)}
            maxValue={asDate(shownTo)}
            onChange={(value) => {
              // The picker re-emits the day it was given on mount; only a
              // day that differs from what is shown reaches the address.
              const next = asIsoDay(value)
              if (next !== (from ?? period?.from_day ?? null)) {
                setPeriod(next, to ?? null)
              }
            }}
          />
          <DatePicker
            aria-label={t("marketplaceAnalytics.filters.to")}
            value={asDate(shownTo)}
            minValue={asDate(shownFrom)}
            maxValue={new Date()}
            onChange={(value) => {
              const next = asIsoDay(value)
              if (next !== (to ?? period?.to_day ?? null)) {
                setPeriod(from ?? null, next)
              }
            }}
          />
        </div>
      </div>
    </>
  )
}
