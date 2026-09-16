/** Контраст пар палитры по WCAG 2.2. Дешёвая проверка ДО сборки и axe-прогона. */
const hex = (h) => { const s = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) }
const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
export const lum = (h) => { const [r, g, b] = hex(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
export const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
/** Смешение переднего цвета с фоном при opacity — так рисует браузер. */
export const mix = (fg, bg, alpha) => {
  const [a, b] = [hex(fg), hex(bg)]
  return "#" + a.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, "0")).join("")
}
export const PAIRS = [
  ["--foreground", "--background", 4.5],
  ["--muted-foreground", "--background", 4.5],
  ["--muted-foreground", "--secondary", 4.5],
  ["--muted-foreground", "--surface-media", 4.5],
  ["--secondary-foreground", "--secondary", 4.5],
  ["--card-foreground", "--card", 4.5],
  ["--popover-foreground", "--popover", 4.5],
  ["--primary-foreground", "--primary", 4.5],
  ["--accent-foreground", "--accent", 4.5],
  ["--destructive-foreground", "--destructive", 4.5],
  ["--link", "--background", 4.5],
  ["--success", "--background", 4.5],
  ["--foreground", "--secondary", 4.5],
]
export function audit(name, t) {
  const bad = []
  for (const [fg, bg, need] of PAIRS) {
    if (!t[fg] || !t[bg]) continue
    const r = ratio(t[fg], t[bg])
    if (r < need) bad.push(`${fg} на ${bg}: ${r.toFixed(2)} < ${need}`)
  }
  // приглушённая мета в инверсном футере рисуется с прозрачностью 0.8
  const r2 = ratio(mix(t["--primary-foreground"], t["--primary"], 0.8), t["--primary"])
  if (r2 < 4.5) bad.push(`инверсный футер (meta 0.8): ${r2.toFixed(2)} < 4.5`)
  return bad
}
