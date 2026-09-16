/** Общие помощники рендера. Ничего, что знает о конкретном блоке. */

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c])

/** Атрибуты: false/null/undefined опускаются, true печатается голым именем. */
export function attrs(o = {}) {
  return Object.entries(o)
    .filter(([, v]) => v !== false && v !== null && v !== undefined && v !== "")
    .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${esc(v)}"`))
    .join("")
}

export const NBSP = " "

/**
 * Цена по правилу QR-PRICE: копейки печатаются ТОЛЬКО когда они не нули,
 * разряды разделены неразрывным пробелом, перед ₽ — неразрывный пробел.
 * Вход — число рублей (может быть дробным).
 */
export function money(value, currency = "₽") {
  const n = Number(value)
  if (!Number.isFinite(n)) return ""
  const kop = Math.round((n - Math.trunc(n)) * 100)
  const whole = Math.trunc(n).toLocaleString("ru-RU").replace(/ |\s/g, NBSP)
  return `${whole}${kop ? "," + String(kop).padStart(2, "0") : ""}${NBSP}${currency}`
}

/** Русское склонение: plural(3, "отзыв", "отзыва", "отзывов") → "отзыва". */
export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return many
  if (b > 1 && b < 5) return few
  if (b === 1) return one
  return many
}

/** Ярлык из служебного значения: сырая категория на экран не попадает (правило 18e). */
export const cap = (s) => { const t = String(s || "").trim(); return t ? t[0].toUpperCase() + t.slice(1) : "" }

/** Первая буква названия для спроектированной заглушки (QR-EMPTY). */
export const initial = (s) => String(s || "?").trim().charAt(0).toUpperCase()

export const join = (...parts) => parts.filter(Boolean).join("")
export const map = (arr, fn) => (arr || []).map(fn).join("")

/** Идентификатор из строки — для id/for/aria-controls. */
export const slug = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-|-$/g, "").slice(0, 48)
