// composer/lib/page.js — one home page assembled out of the corridor variants.
//
// A composition is a SPEC: { brand, mode, width, header, hero, tiles, listing, footer }. Every value
// is a key of the labs Ivan already looked at (H1–H5 on :8302, G–M on :8301, GA/GB on :8302,
// P1–P5, F1–F5), plus the two free corridor points added here 2026-09-09 (H6, F6 — see blocks.js),
// so a saved version names things that exist on disk and nowhere else.
// The page order is the storefront's: promo strip + header → hero → category tiles → listing → footer.
import { FAMILIES, storeShell, tilesRow, moveA } from "./blocks.js"
import { heroMarkup, HERO_VARIANTS } from "./hero.js"

const family = (key) => FAMILIES.find((f) => f.key === key)
const variantsOf = (key) => family(key).variants.map((v) => ({ key: v.key, name: v.name, why: v.why }))

/** Every slot with its allowed values, in the order the rail shows them. */
export const SLOTS = [
  { key: "header", name: "Хедер", options: variantsOf("header") },
  {
    key: "hero",
    name: "Hero",
    options: [
      { key: "none", name: "— нет", why: "Страница открывается плитками или выкладкой." },
      ...HERO_VARIANTS,
      ...variantsOf("gallery"),
    ],
  },
  { key: "tiles", name: "Плитки категорий", options: [{ key: "on", name: "есть" }, { key: "off", name: "нет" }] },
  { key: "listing", name: "Выкладка", options: [{ key: "none", name: "— нет" }, ...variantsOf("listing")] },
  { key: "footer", name: "Футер", options: [{ key: "none", name: "— нет" }, ...variantsOf("footer")] },
]

export const MODES = ["light", "dark"]
export const WIDTHS = [{ key: "desktop", name: "1440" }, { key: "mobile", name: "390" }]

/** What the storefront ships today: H1 + K + tiles + P1 + F1 in the brand's default mode. */
export const defaultSpec = (p) => ({
  brand: p.id, mode: p.defaultMode, width: "desktop",
  header: "h1", hero: "k", tiles: "on", listing: "p1", footer: "f1",
})

/** Reject a spec that names something the labs do not have; returns the first problem or null. */
export function validateSpec(spec, DATA) {
  if (!DATA.some((p) => p.id === spec.brand)) return `brand "${spec.brand}" is not a profile`
  if (!MODES.includes(spec.mode)) return `mode "${spec.mode}" is not light|dark`
  if (!WIDTHS.some((w) => w.key === spec.width)) return `width "${spec.width}" is not desktop|mobile`
  for (const slot of SLOTS) {
    if (!slot.options.some((o) => o.key === spec[slot.key])) return `${slot.key} "${spec[slot.key]}" is not one of ${slot.options.map((o) => o.key).join("|")}`
  }
  return null
}

const markupOf = (familyKey, variantKey, p) => family(familyKey).variants.find((v) => v.key === variantKey).markup(p)

function heroOf(spec, p) {
  if (spec.hero === "none") return ""
  if (spec.hero === "ga" || spec.hero === "gb") return `<div class="blk gallery" data-blk="${spec.hero}">${markupOf("gallery", spec.hero, p)}</div>`
  return `<div class="blk hero-slot" data-blk="${spec.hero}">${heroMarkup(spec.hero, p)}</div>`
}

/** The whole page as one .store node, ready for innerHTML. */
export function composePage(p, spec) {
  const inner =
    `<div class="blk header" data-blk="${spec.header}">${markupOf("header", spec.header, p)}</div>` +
    heroOf(spec, p) +
    (spec.tiles === "on" ? `<div class="blk tiles-slot" data-blk="tiles">${tilesRow(p)}</div>` : "") +
    (spec.listing === "none" ? "" : `<div class="blk listing" data-blk="${spec.listing}">${markupOf("listing", spec.listing, p)}</div>`) +
    (spec.footer === "none" ? "" : `<div class="blk footer" data-blk="${spec.footer}">${markupOf("footer", spec.footer, p)}</div>`)
  return storeShell(p, spec.mode, inner)
}

/** Things the labs do after paint: position the carousel, fit the giant wordmark to the store width. */
export function afterRender(root) {
  for (const section of root.querySelectorAll(".gal.ga")) moveA(section, 0)
  return document.fonts.ready.then(() => {
    for (const giant of root.querySelectorAll(".ft .giant")) {
      giant.style.fontSize = ""
      let size = parseFloat(getComputedStyle(giant).fontSize)
      for (let i = 0; i < 6 && giant.scrollWidth > giant.clientWidth && size > 40; i++) {
        size = Math.floor(size * (giant.clientWidth / giant.scrollWidth) * 0.98)
        giant.style.fontSize = `${size}px`
      }
    }
  })
}

/** Short mono summary of a spec for lists and file names: "H2 · K · tiles · P3 · F2". */
export const specLine = (spec) =>
  [spec.header, spec.hero, spec.tiles === "on" ? "tiles" : null, spec.listing, spec.footer]
    .filter((x) => x && x !== "none")
    .map((x) => (x === "tiles" ? x : x.toUpperCase()))
    .join(" · ")
