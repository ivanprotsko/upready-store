// Formatting only: money, counts, dates and the change in percent, the way the panel prints them
// (getStylizedAmount, «+4%»). Nothing here sums, filters or sorts what a production query returns.

const DIGITS = { rub: 0, eur: 2, usd: 2 }

export const money = (value, currency) => {
  const fraction = Number.isInteger(value) ? 0 : (DIGITS[currency] ?? 2)
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
  }).format(value)
}

export const count = (value) => new Intl.NumberFormat("ru-RU").format(value)

/** The change against the previous period, as the panel's ChangeBadge prints it; null when there is nothing to compare. */
export const changePct = (current, previous) =>
  previous > 0 ? Math.round(((current - previous) / previous) * 100) : null

export const plural = (n, one, few, many) => {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

/** «09:00» in Moscow time, the clock the owner reads in both panels. */
export const moscowTime = (iso) =>
  new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }).format(
    new Date(iso),
  )

export const shortDate = (isoDay) =>
  new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${isoDay}T00:00:00Z`))
    .replace(".", "")

export const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
