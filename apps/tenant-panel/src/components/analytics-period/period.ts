/**
 * The period of an analytics page, shared by «Wildberries → Аналитика»
 * (t-2026-10-16-36) and «Аналитика магазина» (t-2026-10-20-45): one control in
 * the panel, not two. The period lives in the address as `from` and `to`
 * (`YYYY-MM-DD`); no `from` and no `to` is the default period, 30 days.
 */

/** The ready periods, in days. «Этот месяц» comes after them. */
export const PRESETS = [7, 30, 90] as const

export const DEFAULT_PRESET = 30

export type Preset = number | "month"

export const asDate = (value: string | undefined): Date | undefined => {
  if (!value) {
    return undefined
  }
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) {
    return undefined
  }
  return new Date(year, month - 1, day)
}

/** `Date` → `YYYY-MM-DD` by the LOCAL calendar; `toISOString` would shift the day east of Greenwich (w15). */
export const asIsoDay = (value: Date | null): string | null => {
  if (!value || Number.isNaN(value.getTime())) {
    return null
  }
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
}

/** The first day of a ready period ending today; the server stops `to` at the shop's today itself. */
export const presetFrom = (preset: Preset, today: Date = new Date()): string | null => {
  if (preset === "month") {
    return asIsoDay(new Date(today.getFullYear(), today.getMonth(), 1))
  }
  const from = new Date(today)
  from.setDate(from.getDate() - (preset - 1))
  return asIsoDay(from)
}

/** Which ready period the address says, or `null` for a hand-picked range. */
export const activePresetOf = (from: string | undefined, to: string | undefined, today: Date = new Date()): Preset | null => {
  if (!from && !to) {
    return DEFAULT_PRESET
  }
  if (to) {
    return null
  }
  if (from === presetFrom("month", today)) {
    return "month"
  }
  return PRESETS.find((preset) => presetFrom(preset, today) === from) ?? null
}

/** `YYYY-MM-DD` shifted by whole days, on the local calendar. */
export const shiftDay = (day: string, by: number): string | null => {
  const date = asDate(day)
  if (!date) {
    return null
  }
  date.setDate(date.getDate() + by)
  return asIsoDay(date)
}

/** The two days the address stands for, the default period filled in. */
export const resolveDays = (
  from: string | undefined,
  to: string | undefined,
  today: Date = new Date()
): { from_day: string; to_day: string } => {
  const end = to ?? asIsoDay(today) ?? ""
  const start = from ?? (to ? (shiftDay(to, -(DEFAULT_PRESET - 1)) ?? to) : (presetFrom(DEFAULT_PRESET, today) ?? end))
  return { from_day: start, to_day: end }
}

/** The days in the period, both ends counted. */
export const daysIn = (days: { from_day: string; to_day: string }): number => {
  const start = asDate(days.from_day)
  const end = asDate(days.to_day)
  if (!start || !end) {
    return DEFAULT_PRESET
  }
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1)
}

/** The query `GET /tenants/analytics/summary` reads for the days the address stands for. */
export const summaryQueryOf = (
  from: string | undefined,
  to: string | undefined,
  today: Date = new Date()
): { period: "30d" } | { period: "custom"; from: string; to: string } => {
  if (!from && !to) {
    return { period: "30d" }
  }
  const days = resolveDays(from, to, today)
  return { period: "custom", from: days.from_day, to: days.to_day }
}
