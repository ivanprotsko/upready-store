/**
 * Number and day formatting shared by the blocks of «Аналитика» v3
 * (t-2026-10-16-36). Money is printed in whole units on the tiles and charts,
 * the way the prototype does; `Intl` puts a no-break space before «₽», so the
 * sign never wraps onto its own line on a phone.
 */

export const moneyWhole = (value: number, currency: string | null, locale: string): string =>
  currency
    ? new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
        maximumFractionDigits: 0,
      }).format(value)
    : new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)

/** «150 тыс ₽», «2,6 млн ₽»: the axis and the donut's centre. */
export const moneyCompact = (value: number, currency: string | null, locale: string): string =>
  currency
    ? new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value)
    : new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value)

export const count = (value: number, locale: string): string => new Intl.NumberFormat(locale).format(value)

export const pct = (value: number, locale: string): string =>
  `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} %`

/**
 * The change against the previous period, percent; `null` when there is
 * nothing to compare with (no previous period, or a previous zero): a change
 * from nothing is not «+∞ %».
 */
export const changeOf = (now: number | null, before: number | null | undefined): number | null => {
  if (now === null || before === null || before === undefined || before === 0) {
    return null
  }
  return ((now - before) / before) * 100
}

export const signedPct = (value: number, locale: string): string => {
  const digits = Math.abs(value) < 10 ? 1 : 0
  const text = new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
    signDisplay: "exceptZero",
  }).format(value)
  return `${text.replace("-", "−")} %`
}

/** `YYYY-MM-DD` as a local calendar day; never through UTC, which would shift it. */
export const dayDate = (day: string): Date => {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(year, (month ?? 1) - 1, date ?? 1)
}

export const dayShort = (day: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(dayDate(day)).replace(".", "")

export const dayLong = (day: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(dayDate(day))

export const dayWithWeekday = (day: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "long" }).format(dayDate(day))

/** «21 сент — 20 окт»: the period chip of the phone bar. */
export const rangeShort = (from: string, to: string, locale: string): string =>
  `${dayShort(from, locale)} — ${dayShort(to, locale)}`
