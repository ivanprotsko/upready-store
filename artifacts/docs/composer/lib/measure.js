// composer/lib/measure.js — worst contrast ratio of the text inside a block, on flat grounds.
// source: blocks-lab/index.html @893d6f8, script lines 602-651, verbatim plus `export` on measure().

const srgb = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
const rgba = (s) => {
  const m = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/.exec(s)
  if (m) return [+m[1] * 255, +m[2] * 255, +m[3] * 255, m[4] === undefined ? 1 : +m[4]]
  const n = (s.match(/[\d.]+/g) ?? []).map(Number); return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n[3] ?? 1]
}
const over = (fg, bg) => fg.slice(0, 3).map((c, i) => c * fg[3] + bg[i] * (1 - fg[3]))
function groundOf(el, root) {
  let layers = [], node = el
  while (node && node !== root.parentElement) {
    const cs = getComputedStyle(node)
    if (cs.backgroundImage !== "none" && !/^(repeating-)?(linear|radial|conic)-gradient/.test(cs.backgroundImage)) return { photo: true }
    if (node.tagName === "IMG") return { photo: true }
    const c = rgba(cs.backgroundColor)
    if (c[3] > 0) { layers.push(c); if (c[3] === 1) break }
    node = node.parentElement
  }
  let ground = [255, 255, 255]
  for (const layer of layers.reverse()) ground = over(layer, ground)
  return { photo: false, ground }
}
export function measure(scope, root) {
  const rows = []
  let onPhoto = 0
  for (const el of scope.querySelectorAll("h2, h3, h4, h5, p, span, a, div, li, figcaption, button, b, input")) {
    const text = el.tagName === "INPUT" ? el.placeholder : [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (!text) continue
    const cs = getComputedStyle(el)
    if (cs.display === "none" || Number(cs.opacity) === 0 || el.getClientRects().length === 0) continue
    // a dimmed carousel neighbour is not what the eye reads — the active slide is measured
    if (el.closest(".slide") && !el.closest(".slide").classList.contains("on")) continue
    const g = groundOf(el, root)
    if (g.photo) { onPhoto++; continue }
    const ink = over([...rgba(cs.color).slice(0, 3), rgba(cs.color)[3] * Number(cs.opacity || 1)], g.ground)
    const size = parseFloat(cs.fontSize), weight = Number(cs.fontWeight) || 400
    const large = size >= 24 || (size >= 18.66 && weight >= 700)
    rows.push({ r: ratio(lum(ink), lum(g.ground)), need: large ? 3 : 4.5, label: (el.tagName === "INPUT" ? el.placeholder : el.textContent).trim().slice(0, 28) })
  }
  if (!rows.length) return { verdict: "none", text: "нечего мерить" }
  rows.sort((a, b) => a.r / a.need - b.r / b.need)
  const worst = rows[0]
  const fails = rows.filter((x) => x.r < x.need)
  const tail = onPhoto ? ` · ${onPhoto} узл. на фото` : ""
  return fails.length
    ? { verdict: "fail", text: `${fails.length} ниже порога · худший ${worst.r.toFixed(1)}:1 при ${worst.need} — «${worst.label}»${tail}` }
    : { verdict: "pass", text: `${rows.length} узлов на плоском фоне · запас ${worst.r.toFixed(1)}:1 при ${worst.need}${tail}` }
}

