/** Монохромные иконки: inline SVG, обводка 1.5, currentColor (канон Geist). */
const w = (d, extra = "") =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}${extra}</svg>`

export const icons = {
  search: w('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  cart: w('<path d="M3 4h2l2.2 10.4a2 2 0 0 0 2 1.6h7.4a2 2 0 0 0 2-1.6L20 8H6"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>'),
  user: w('<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>'),
  menu: w('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  close: w('<path d="M6 6l12 12M18 6L6 18"/>'),
  chevronDown: w('<path d="m6 9 6 6 6-6"/>'),
  chevronRight: w('<path d="m9 6 6 6-6 6"/>'),
  chevronLeft: w('<path d="m15 6-6 6 6 6"/>'),
  plus: w('<path d="M12 5v14M5 12h14"/>'),
  minus: w('<path d="M5 12h14"/>'),
  check: w('<path d="m5 13 4 4 10-10"/>'),
  truck: w('<path d="M3 16V6h11v10M14 9h4l3 3v4h-7"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="17.5" cy="17.5" r="1.5"/>'),
  shield: w('<path d="M12 3l7 3v5c0 4.2-2.9 7.7-7 9-4.1-1.3-7-4.8-7-9V6z"/>'),
  leaf: w('<path d="M5 19c0-8 6-13 14-13 0 8-5 14-13 14H5z"/><path d="M5 19c3-4 6-6 9-7"/>'),
  box: w('<path d="M3 8l9-4 9 4-9 4z"/><path d="M3 8v8l9 4 9-4V8"/><path d="M12 12v8"/>'),
  ruler: w('<rect x="3" y="8" width="18" height="8" rx="1"/><path d="M7 8v3M11 8v4M15 8v3M19 8v4"/>'),
  star: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 3.5 2.6 5.5 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.8l5.9-.8z"/></svg>',
  starEmpty: w('<path d="m12 3.5 2.6 5.5 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.8l5.9-.8z"/>'),
  grid: w('<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>'),
  list: w('<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'),
  expand: w('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>'),
  mail: w('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
  phone: w('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>'),
  pin: w('<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
}

/** Пять звёзд рейтинга: заливка --foreground, второго акцента нет (канон Geist). */
export function stars(value) {
  const full = Math.round(Number(value) || 0)
  return Array.from({ length: 5 }, (_, i) => (i < full ? icons.star : icons.starEmpty)).join("")
}
