// The verdict half of `pnpm template:check` (t-2026-10-12-33): the 16.09 templates lab's quality rules
// (origin/feat/day16-store-templates-lab, artifacts/docs/store-templates-lab/design/quality-rules.md), ported to the
// rendered storefront. Each rule keeps its lab id, its threshold and its kind: a `gate` fails the run, a `report`
// prints a number to compare templates by and never fails. No browser here: everything takes the facts
// `./measure.mjs` returned, so `rules.test.mjs` runs it on plain objects.
//
// Three lab rules are not ported, because they measure the lab's own source, not a page: QR-PROSE (the text of
// the lab's template files; a shop's text comes from its catalogue), QR-TOKENS (literal values in block CSS;
// `pnpm lint:blocks` does that here) and QR-TOKEN-COVERAGE (scale tokens a template overrides; a manifest here
// can only name closed layers, `validateTemplate()`). QR-MOTION is measured on the page, not in the CSS source.

export const THRESHOLDS = Object.freeze({
  typeRatio: 1.15,
  typeMaxSizes: 8,
  sectionRank: 1.5,
  weightMax: 600,
  caseMaxPx: 12,
  caseMinTracking: 0.06,
  measure: [45, 90],
  columnMinPx: 480,
  columnMinChars: 200,
  space: [4, 8, 12, 16, 24, 32, 48, 64, 96, 128],
  rhythmMax: 2,
  density: [12, 32],
  aspectTolerance: 0.01,
  productPageMaxPx: 6000,
  shadowRecipesMax: 1,
  iconRunMax: 4,
  hitPx: 44,
  motionMaxMs: 240,
  reducedMotionMaxMs: 10,
})

// The lab's radius tokens --r-sm 6, --r-md, --r-lg 12, --r-pill; its style spec maps --r-md onto the storefront's
// own `--radius` («--r-md ≡ витринный --radius»), so the page's `--radius` takes the place of 8.
export const LAB_RADII = Object.freeze({ sm: 6, md: 8, lg: 12 })

// The lab's card grammar, in order; a card may skip a role but never reorder two.
export const CARD_CANON = Object.freeze(["card-media", "card-body", "card-badge", "card-title", "card-price", "card-price-old", "card-meta"])

const PLACEHOLDER_ALT = /^(product|thumbnail|image|photo)\s*\d*$/i

/**
 * id, kind, where it applies and its threshold in words. `on`: `page` a page target, `block` a playground anchor,
 * `pages` the comparison across a template's pages; `width`: the one width it is measured at (the lab's desktop
 * rules at 1280, its phone rules at 360), absent for both.
 */
export const RULES = Object.freeze([
  { id: "QR-TYPE-SCALE", kind: "gate", on: ["page", "block"], threshold: "every size on the declared type scale; neighbours ≥ 1.15×; ≤ 8 sizes" },
  { id: "QR-TYPE-ROLE", kind: "gate", on: ["page", "block", "pages"], threshold: "one role, one size on a page and across a template's pages" },
  { id: "QR-HEADING-RANK", kind: "gate", on: ["page", "block"], threshold: "one h1 per page; no level skipped; size never grows with the level" },
  { id: "QR-SECTION-RANK", kind: "gate", on: ["page", "block"], threshold: "section title ÷ body ≥ 1.5" },
  { id: "QR-WEIGHT", kind: "gate", on: ["page", "block"], threshold: "font-weight ≤ 600" },
  { id: "QR-CASE", kind: "gate", on: ["page", "block"], threshold: "capitals only at ≤ 12px with tracking ≥ 0.06em" },
  { id: "QR-MEASURE", kind: "gate", on: ["page", "block"], width: 1280, threshold: "45 ≤ characters per line ≤ 90 (45 for prose only)" },
  { id: "QR-COLUMN-RANK", kind: "gate", on: ["page", "block"], width: 1280, threshold: "the longest text (> 200 chars) sits in a column ≥ 480px" },
  { id: "QR-SPACE-SCALE", kind: "gate", on: ["page", "block"], threshold: "padding, margin and gap on 4·8·12·16·24·32·48·64·96·128" },
  { id: "QR-SECTION-RHYTHM", kind: "report", on: ["page"], threshold: "≤ 2 distinct gaps between bands" },
  { id: "QR-GRID-AXES", kind: "gate", on: ["page", "block"], threshold: "every content container on one left edge" },
  { id: "QR-DENSITY", kind: "report", on: ["page"], width: 1280, threshold: "12 ≤ text elements above the fold ≤ 32" },
  { id: "QR-IMG-ASPECT", kind: "gate", on: ["page", "block", "pages"], threshold: "every picture in a hard box; one ratio per role, on a page and across pages; nothing drawn 0×0" },
  { id: "QR-IMG-FRAME", kind: "gate", on: ["page", "block"], threshold: "card pictures on one surface, with one fit" },
  { id: "QR-CARD-SURFACE", kind: "gate", on: ["page", "block"], threshold: "a product card has a background, a border or a rounded picture" },
  { id: "QR-GALLERY", kind: "gate", on: ["page"], threshold: "one main frame; thumbnail ratio = frame ratio (±0.01); product page ≤ 6000px at 1280" },
  { id: "QR-ALT", kind: "gate", on: ["page", "block"], threshold: "product pictures carry a real alt; no image lacks the attribute; no «Product image 1»" },
  { id: "QR-EMPTY", kind: "gate", on: ["page", "block"], threshold: "the no-photo placeholder sits in the frame's own ratio box; an empty block draws nothing" },
  { id: "QR-CARD-GRAMMAR", kind: "gate", on: ["page", "block", "pages"], threshold: "card roles in canon order; the same product has one card signature on every page" },
  { id: "QR-PRICE", kind: "gate", on: ["page", "block"], threshold: "tabular-nums; no «,00»; no-break space before ₽; card price differs from the title in weight or size" },
  { id: "QR-RADIUS", kind: "gate", on: ["page", "block", "pages"], threshold: "radii only 6 · --radius · 12 · pill; one radius per component role across pages" },
  { id: "QR-ELEVATION", kind: "gate", on: ["page", "block"], threshold: "≤ 1 shadow recipe" },
  { id: "QR-CONTROL-DENSITY", kind: "gate", on: ["page", "block"], threshold: "≤ 4 icon-only controls in one header row" },
  { id: "QR-TECTONICS", kind: "report", on: ["page"], width: 1280, threshold: "the footer's surface differs from the page" },
  { id: "QR-OCCLUSION", kind: "gate", on: ["page", "block"], threshold: "titles, prices and buttons are on top at their own point" },
  { id: "QR-JS", kind: "gate", on: ["page", "playground"], threshold: "0 page errors" },
  { id: "QR-CONTRAST", kind: "gate", on: ["page", "block"], threshold: "0 axe color-contrast violations (AA)" },
  { id: "QR-OVERFLOW", kind: "gate", on: ["page", "block"], width: 360, threshold: "0px horizontal overflow" },
  { id: "QR-HIT", kind: "gate", on: ["page", "block"], width: 360, threshold: "every target ≥ 44px high; icon-only ≥ 44px wide; inline links exempt" },
  { id: "QR-FOCUS", kind: "gate", on: ["page", "block"], threshold: "a visible focus ring, distinct from rest, on every target" },
  { id: "QR-MOTION", kind: "gate", on: ["page", "block"], threshold: "durations ≤ 240ms; under prefers-reduced-motion ≤ 10ms" },
])

export const RULE_BY_ID = Object.freeze(Object.fromEntries(RULES.map((r) => [r.id, r])))

export const NOT_PORTED = Object.freeze([
  { id: "QR-PROSE", why: "checks the text of the lab's own template files; on the storefront the long text is the shop's catalogue, not the template" },
  { id: "QR-TOKENS", why: "a source check of literal values in block CSS; `pnpm lint:blocks` does it on src/modules/blocks" },
  { id: "QR-TOKEN-COVERAGE", why: "scale tokens a lab template overrode; a manifest here names closed layers only, held by validateTemplate()" },
])

/** Does the rule run on this target? */
export function applies(rule, { on, width }) {
  return rule.on.includes(on) && (rule.width === undefined || rule.width === width)
}

/** Neighbouring ratios of a set of numbers, ascending: is there a scale. */
export function ratios(values) {
  const s = [...new Set(values)].sort((a, b) => a - b)
  return s.slice(1).map((v, i) => ({ from: s[i], to: v, ratio: Math.round((v / s[i]) * 1000) / 1000 }))
}

/** `3 / 4` → 0.75; `auto 800 / 600` → 1.333; `auto` → null. */
export function parseAspect(value) {
  if (!value) return null
  const m = String(value).match(/(\d*\.?\d+)\s*\/\s*(\d*\.?\d+)/)
  if (m) return Math.round((Number(m[1]) / Number(m[2])) * 1000) / 1000
  const n = Number(String(value).replace(/^auto\s*/, ""))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Is a price text set as the lab wants it: no «,00», a no-break space before ₽. */
export function priceTextProblems(text) {
  const out = []
  if (/[,.]00(?!\d)/.test(text)) out.push("zero kopecks shown")
  if (/₽/.test(text) && !/[  ]₽/.test(text)) out.push("no no-break space before ₽")
  return out
}

/** Does a card signature keep the canon order (a role may be missing, never moved)? */
export function followsCanon(sig, canon = CARD_CANON) {
  let at = 0
  for (const role of sig.split(">").filter(Boolean)) {
    const j = canon.indexOf(role, at)
    if (j < 0) return false
    at = j
  }
  return true
}

/** Radii a target may use: the lab's four tokens with --r-md as the page's own --radius. */
export function allowedRadii(radiusVar) {
  const md = typeof radiusVar === "number" && Number.isFinite(radiusVar) ? Math.round(radiusVar * 100) / 100 : LAB_RADII.md
  return new Set([0, LAB_RADII.sm, md, LAB_RADII.lg, "pill"])
}

const result = (id, failures, value, extra = {}) => ({
  rule: id,
  kind: RULE_BY_ID[id].kind,
  threshold: RULE_BY_ID[id].threshold,
  pass: failures.length === 0,
  value,
  // A failure's `sig` is what makes it the same failure next run (the baseline key); `detail` is for people.
  failures,
  ...extra,
})
const fail = (sig, detail = sig) => ({ sig, detail })

/**
 * Every rule that applies to one target, from its facts. `ctx`: `{ on, width, page, typeScale, errors,
 * motion, reducedMotion, focus, contrast }`; `page` is home | category | product | fixture | null.
 * @returns {Array<{ rule: string, kind: string, threshold: string, pass: boolean, value: unknown, failures: Array<{ sig: string, detail: string }> }>}
 */
export function evaluateTarget(facts, ctx) {
  const T = THRESHOLDS
  const out = []
  const run = (id, fn) => {
    if (!applies(RULE_BY_ID[id], ctx)) return
    out.push(fn())
  }
  const isPage = ctx.on === "page"

  run("QR-TYPE-SCALE", () => {
    const sizes = facts.type.sizes.map((s) => Number(s.value)).sort((a, b) => a - b)
    const f = []
    for (const s of facts.type.sizes) {
      if (!ctx.typeScale.includes(Number(s.value))) f.push(fail(`size ${s.value}px off the scale`, `${s.value}px ×${s.count}, e.g. ${s.samples[0] ?? ""}`))
    }
    if (sizes.length > T.typeMaxSizes) f.push(fail(`more than ${T.typeMaxSizes} sizes`, `${sizes.length} sizes: ${sizes.join(", ")}`))
    for (const r of ratios(sizes)) {
      if (r.ratio < T.typeRatio) f.push(fail(`sizes ${r.from}→${r.to} closer than ${T.typeRatio}`, `${r.from}→${r.to} = ${r.ratio}`))
    }
    return result("QR-TYPE-SCALE", f, sizes)
  })

  run("QR-TYPE-ROLE", () => {
    const f = []
    for (const [role, list] of Object.entries(facts.roles)) {
      const uniq = [...new Set(list)]
      if (uniq.length > 1) f.push(fail(`role ${role} has more than one size`, `${role}: ${uniq.join(", ")}px`))
    }
    return result("QR-TYPE-ROLE", f, Object.fromEntries(Object.entries(facts.roles).map(([k, v]) => [k, [...new Set(v)]])))
  })

  run("QR-HEADING-RANK", () => {
    const hs = facts.headings
    const f = []
    const h1 = hs.filter((h) => h.level === 1).length
    if (isPage && h1 !== 1) f.push(fail("not exactly one h1", `h1 × ${h1}`))
    const byLevel = {}
    for (const h of hs) byLevel[h.level] = Math.max(byLevel[h.level] ?? 0, h.size)
    const levels = Object.keys(byLevel).map(Number).sort((a, b) => a - b)
    for (let i = 1; i < levels.length; i += 1) {
      const [a, b] = [levels[i - 1], levels[i]]
      if (b - a > 1) f.push(fail(`level skipped h${a}→h${b}`))
      if (byLevel[b] > byLevel[a]) f.push(fail(`h${b} larger than h${a}`, `h${b} ${byLevel[b]}px > h${a} ${byLevel[a]}px`))
    }
    return result("QR-HEADING-RANK", f, hs.map((h) => `h${h.level} ${h.size}`))
  })

  run("QR-SECTION-RANK", () => {
    const sec = facts.roles["section-title"]?.length ? Math.min(...facts.roles["section-title"]) : null
    const body = facts.body
    if (!sec || !body) return result("QR-SECTION-RANK", [], null, { na: "no section title or no body text" })
    const ratio = Math.round((sec / body) * 100) / 100
    return result("QR-SECTION-RANK", ratio < T.sectionRank ? [fail(`section title ÷ body below ${T.sectionRank}`, `${sec}px ÷ ${body}px = ${ratio}`)] : [], ratio)
  })

  run("QR-WEIGHT", () => {
    const f = facts.type.weights.filter((w) => Number(w.value) > T.weightMax).map((w) => fail(`weight ${w.value}`, `${w.value} ×${w.count}, e.g. ${w.samples[0] ?? ""}`))
    return result("QR-WEIGHT", f, facts.type.weights.map((w) => Number(w.value)))
  })

  run("QR-CASE", () => {
    const f = facts.upper
      .filter((u) => !(u.size <= T.caseMaxPx && u.tracking >= T.caseMinTracking))
      .map((u) => fail(`capitals: ${u.el}`, `${u.el} at ${u.size}px, tracking ${u.tracking}em`))
    return result("QR-CASE", f, facts.upper.length)
  })

  run("QR-MEASURE", () => {
    const [lo, hi] = T.measure
    const f = []
    for (const l of facts.lines) {
      if (l.cpl > hi) f.push(fail(`over ${hi} cpl: ${l.el}`, `${l.cpl} cpl in ${l.width}px: ${l.el}`))
      else if (l.prose && l.cpl < lo) f.push(fail(`prose under ${lo} cpl: ${l.el}`, `${l.cpl} cpl in ${l.width}px: ${l.el}`))
    }
    return result("QR-MEASURE", f, facts.lines.length ? facts.lines[0].cpl : null)
  })

  run("QR-COLUMN-RANK", () => {
    const l = facts.longest
    const bad = l && l.len > T.columnMinChars && l.width < T.columnMinPx
    return result("QR-COLUMN-RANK", bad ? [fail("longest text in a column under 480px", `${l.len} chars in ${l.width}px: ${l.el}`)] : [], l ? { chars: l.len, width: l.width } : null)
  })

  run("QR-SPACE-SCALE", () => {
    const f = facts.spacing
      .filter((s) => !T.space.includes(Number(s.value)))
      .map((s) => fail(`space ${s.value}px off the scale`, `${s.value}px ×${s.count}, e.g. ${s.samples[0] ?? ""}`))
    return result("QR-SPACE-SCALE", f, facts.spacing.map((s) => Number(s.value)).sort((a, b) => a - b))
  })

  run("QR-SECTION-RHYTHM", () =>
    result("QR-SECTION-RHYTHM", facts.bandGaps.length > T.rhythmMax ? [fail(`more than ${T.rhythmMax} band gaps`, facts.bandGaps.join(", "))] : [], facts.bandGaps)
  )

  run("QR-GRID-AXES", () =>
    result(
      "QR-GRID-AXES",
      facts.containerEdges.length > 1 ? [fail("content containers on more than one left edge", facts.containerEdges.join(", "))] : [],
      facts.containerEdges
    )
  )

  run("QR-DENSITY", () => {
    const n = facts.textAboveFold
    const [lo, hi] = T.density
    return result("QR-DENSITY", n < lo || n > hi ? [fail(`text above the fold outside ${lo}…${hi}`, String(n))] : [], n)
  })

  run("QR-IMG-ASPECT", () => {
    const f = []
    const byRole = {}
    for (const fr of facts.frames) (byRole[fr.role] ||= []).push(fr)
    for (const [role, list] of Object.entries(byRole)) {
      const rs = [...new Set(list.map((x) => x.ratio))]
      const spread = Math.max(...rs) - Math.min(...rs)
      if (spread > T.aspectTolerance) f.push(fail(`role ${role}: more than one ratio`, `${role}: ${rs.join(", ")}`))
      if (list.some((x) => x.declared === "auto")) f.push(fail(`role ${role}: a frame without aspect-ratio`))
      if (list.some((x) => !x.w || !x.h)) f.push(fail(`role ${role}: a frame drawn 0×0`))
    }
    for (const img of facts.images) {
      if (img.zero) f.push(fail(`picture drawn 0×0: ${img.el}`))
      else if (img.shown && !img.hardBox) f.push(fail(`picture without a hard box: ${img.el}`))
    }
    return result("QR-IMG-ASPECT", f, Object.fromEntries(Object.entries(byRole).map(([k, v]) => [k, [...new Set(v.map((x) => x.ratio))]])))
  })

  run("QR-IMG-FRAME", () => {
    const framed = facts.frames.filter((x) => x.role === "card" && x.state !== "placeholder")
    const bgs = [...new Set(framed.map((x) => x.bg))]
    const fits = [...new Set(framed.map((x) => x.fit).filter(Boolean))]
    const f = []
    if (bgs.length > 1) f.push(fail("card pictures on more than one surface", bgs.join(" | ")))
    if (fits.length > 1) f.push(fail("card pictures with more than one fit", fits.join(", ")))
    return result("QR-IMG-FRAME", f, { surfaces: bgs, fits })
  })

  run("QR-CARD-SURFACE", () => {
    const bare = facts.cards.filter((c) => !c.surface)
    return result("QR-CARD-SURFACE", bare.length ? [fail("product card without a surface", `${bare.length} of ${facts.cards.length}, e.g. ${bare[0].href}`)] : [], facts.cards.length)
  })

  run("QR-GALLERY", () => {
    const f = []
    const g = facts.gallery
    if (g) {
      if (g.frames !== 1) f.push(fail("not exactly one main frame", `${g.frames} frames`))
      if (g.thumb !== null && Math.abs(g.main - g.thumb) > T.aspectTolerance) f.push(fail("thumbnail ratio differs from the frame", `${g.thumb} vs ${g.main}`))
    }
    if (ctx.page === "product" && ctx.width === 1280 && facts.pageHeight > T.productPageMaxPx) {
      f.push(fail(`product page taller than ${T.productPageMaxPx}px`, `${facts.pageHeight}px`))
    }
    return result("QR-GALLERY", f, g ? { ...g, pageHeight: facts.pageHeight } : { pageHeight: facts.pageHeight })
  })

  run("QR-ALT", () => {
    const f = []
    for (const img of facts.images) {
      if (img.decorative) continue
      if (img.alt === null) f.push(fail(`picture without an alt attribute: ${img.el}`))
      else if (img.product && !img.alt.trim()) f.push(fail(`product picture with an empty alt: ${img.el}`))
      else if (PLACEHOLDER_ALT.test(img.alt.trim())) f.push(fail(`placeholder alt «${img.alt.trim()}»`))
    }
    return result("QR-ALT", f, facts.images.length)
  })

  run("QR-EMPTY", () => {
    const f = []
    const photo = facts.frames.filter((x) => x.state === "photo")
    for (const p of facts.frames.filter((x) => x.state === "placeholder")) {
      if (p.declared === "auto") f.push(fail(`placeholder of ${p.role} outside a ratio box`))
      const same = photo.find((x) => x.role === p.role)
      if (same && Math.abs(same.ratio - p.ratio) > T.aspectTolerance) f.push(fail(`placeholder of ${p.role} in another ratio`, `${p.ratio} vs ${same.ratio}`))
    }
    if (ctx.state === "empty" && facts.drawn.h > 4 && !facts.drawn.text && !facts.drawn.media) {
      f.push(fail("empty state draws an empty frame", `${facts.drawn.h}px high, no text, no picture`))
    }
    return result("QR-EMPTY", f, { placeholders: facts.frames.filter((x) => x.state === "placeholder").length, drawn: facts.drawn })
  })

  run("QR-CARD-GRAMMAR", () => {
    const sigs = [...new Set(facts.cards.map((c) => c.sig))]
    return result(
      "QR-CARD-GRAMMAR",
      sigs.filter((s) => !followsCanon(s)).map((s) => fail(`card signature off the canon: ${s}`)),
      sigs
    )
  })

  run("QR-PRICE", () => {
    const f = []
    for (const p of facts.prices) {
      if (!/tabular-nums/.test(p.numeric)) f.push(fail(`price without tabular-nums: ${p.el.replace(/ «.*$/, "")}`, `${p.el}: ${p.numeric}`))
      for (const problem of priceTextProblems(p.text)) f.push(fail(`price: ${problem}`, p.text))
    }
    const card = facts.prices.find((p) => /\[price\]/.test(p.el))
    if (card && facts.cardTitle && card.weight === facts.cardTitle.weight && card.size === facts.cardTitle.size) {
      f.push(fail("card price set like the card title", `${card.weight}/${card.size}`))
    }
    return result("QR-PRICE", [...new Map(f.map((x) => [x.sig, x])).values()], facts.prices.map((p) => p.text))
  })

  run("QR-RADIUS", () => {
    const allowed = allowedRadii(facts.radiusVar)
    const f = facts.radii
      .filter((r) => !allowed.has(r.value === "pill" ? "pill" : Number(r.value)))
      .map((r) => fail(`radius ${r.value}px off the tokens`, `${r.value}px ×${r.count}, e.g. ${r.samples[0] ?? ""}`))
    return result("QR-RADIUS", f, { used: facts.radii.map((r) => r.value), allowed: [...allowed] })
  })

  run("QR-ELEVATION", () =>
    result(
      "QR-ELEVATION",
      facts.shadows.length > T.shadowRecipesMax ? [fail(`more than ${T.shadowRecipesMax} shadow recipe`, facts.shadows.map((s) => s.value).join(" | "))] : [],
      facts.shadows.length
    )
  )

  run("QR-CONTROL-DENSITY", () =>
    result("QR-CONTROL-DENSITY", facts.iconRun > T.iconRunMax ? [fail(`more than ${T.iconRunMax} icon-only controls in a row`, String(facts.iconRun))] : [], facts.iconRun)
  )

  run("QR-TECTONICS", () => {
    const t = facts.footer
    return result("QR-TECTONICS", t && t.footer === t.page ? [fail("footer on the page's own surface", t.page)] : [], t)
  })

  run("QR-OCCLUSION", () => result("QR-OCCLUSION", facts.occluded.map((o) => fail(`${o.el} under ${o.by}`)), facts.occluded.length))

  run("QR-JS", () => result("QR-JS", (ctx.errors ?? []).map((e) => fail(`page error: ${String(e).slice(0, 80)}`)), (ctx.errors ?? []).length))

  run("QR-CONTRAST", () => {
    if (!ctx.contrast || ctx.contrast.error) return result("QR-CONTRAST", [fail("contrast not measured", ctx.contrast?.error ?? "no axe")], null)
    const v = ctx.contrast.violations
    return result("QR-CONTRAST", [...new Map(v.map((x) => [x.el, fail(`contrast: ${x.el}`, `${x.el}: ${x.ratio} < ${x.expected}`)])).values()], v.length)
  })

  run("QR-OVERFLOW", () =>
    result("QR-OVERFLOW", facts.overflow.px > 0 ? [fail("horizontal overflow", `${facts.overflow.px}px: ${facts.overflow.offenders.join(" | ")}`)] : [], facts.overflow.px)
  )

  run("QR-HIT", () => {
    const f = []
    for (const h of facts.hits) {
      if (h.wrappedInLabel) continue
      if (h.h < T.hitPx) f.push(fail(`target under ${T.hitPx}px high: ${h.el}`, `${h.w}×${h.h}: ${h.el}`))
      else if (h.iconOnly && h.w < T.hitPx) f.push(fail(`icon target under ${T.hitPx}px wide: ${h.el}`, `${h.w}×${h.h}: ${h.el}`))
    }
    return result("QR-HIT", [...new Map(f.map((x) => [x.sig, x])).values()], facts.hits.length)
  })

  run("QR-FOCUS", () => {
    const list = ctx.focus ?? []
    return result("QR-FOCUS", [...new Map(list.filter((x) => !x.visible).map((x) => [x.el, fail(`no focus ring: ${x.el}`)])).values()], `${list.filter((x) => x.visible).length}/${list.length}`)
  })

  run("QR-MOTION", () => {
    const f = []
    const m = ctx.motion ?? { max: 0, offenders: [] }
    const long = new Map()
    for (const o of m.offenders) if (o.ms > T.motionMaxMs) long.set(`${o.kind} ${o.ms}ms`, o.el)
    for (const [what, el] of long) f.push(fail(`${what} over ${T.motionMaxMs}ms`, `${what}, e.g. ${el}`))
    const r = ctx.reducedMotion ?? { max: 0, offenders: [] }
    if (r.max > T.reducedMotionMaxMs) {
      const e = r.offenders.sort((a, b) => b.ms - a.ms)[0]
      f.push(fail("motion kept under prefers-reduced-motion", `${r.max}ms, e.g. ${e?.kind} ${e?.el}`))
    }
    return result("QR-MOTION", f, { max: m.max, reduced: r.max })
  })

  return out
}

/**
 * The rules that compare a template's pages at one width (lab: QR-TYPE-ROLE, QR-IMG-ASPECT, QR-CARD-GRAMMAR and
 * QR-RADIUS «на всех страницах шаблона»). `pages`: `{ home: facts, category: facts, product: facts }`.
 */
export function evaluatePages(pages) {
  const entries = Object.entries(pages).filter(([, f]) => f && !f.missing)
  const across = (pick) => {
    const seen = new Map()
    for (const [page, facts] of entries) {
      for (const [key, value] of pick(facts)) {
        if (value === null || value === undefined) continue
        if (!seen.has(key)) seen.set(key, new Map())
        seen.get(key).set(page, value)
      }
    }
    return seen
  }
  const out = []

  {
    const f = []
    const roles = across((facts) => Object.entries(facts.roles).filter(([, v]) => v.length).map(([k, v]) => [k, Math.min(...v)]))
    for (const [role, byPage] of roles) {
      if (new Set(byPage.values()).size > 1) f.push(fail(`role ${role} differs across pages`, [...byPage].map(([p, v]) => `${p} ${v}px`).join(", ")))
    }
    out.push(result("QR-TYPE-ROLE", f, Object.fromEntries([...roles].map(([k, v]) => [k, Object.fromEntries(v)]))))
  }
  {
    const f = []
    const ratiosByRole = across((facts) => {
      const first = {}
      for (const fr of facts.frames) if (fr.state === "photo" && first[fr.role] === undefined) first[fr.role] = fr.ratio
      return Object.entries(first)
    })
    for (const [role, byPage] of ratiosByRole) {
      const vals = [...byPage.values()]
      if (Math.max(...vals) - Math.min(...vals) > THRESHOLDS.aspectTolerance) {
        f.push(fail(`role ${role} changes ratio across pages`, [...byPage].map(([p, v]) => `${p} ${v}`).join(", ")))
      }
    }
    out.push(result("QR-IMG-ASPECT", f, Object.fromEntries([...ratiosByRole].map(([k, v]) => [k, Object.fromEntries(v)]))))
  }
  {
    const f = []
    const sigs = across((facts) => facts.cards.map((c) => [c.href, c.sig]))
    for (const [href, byPage] of sigs) {
      if (new Set(byPage.values()).size > 1) f.push(fail(`one product, two card signatures: ${href}`, [...byPage].map(([p, v]) => `${p} ${v}`).join(" · ")))
    }
    out.push(result("QR-CARD-GRAMMAR", f, sigs.size))
  }
  {
    const f = []
    const radii = across((facts) => Object.entries(facts.roleRadii))
    for (const [role, byPage] of radii) {
      if (new Set(byPage.values()).size > 1) f.push(fail(`role ${role} radius differs across pages`, [...byPage].map(([p, v]) => `${p} ${v}`).join(", ")))
    }
    out.push(result("QR-RADIUS", f, Object.fromEntries([...radii].map(([k, v]) => [k, Object.fromEntries(v)]))))
  }
  return out
}

/** The baseline key of one failure: target, rule and the failure's own signature. */
export const failureKey = (target, rule, sig) => `${target} | ${rule} | ${sig}`

/** A template page target `template/<id>/<page>@<width>` as `{ template, slot: "<page>@<width>" }`; anything else null. */
export function templatePage(target) {
  const m = /^template\/([^/]+)\/([^/@]+@\d+)$/.exec(target)
  return m ? { template: m[1], slot: m[2] } : null
}

/**
 * The baseline's template page failures by page kind and width, any template: `<page>@<width> | <rule> | <sig>`
 * → the template ids that hold it. Block and playground keys are not in it.
 */
export function inheritedIndex(baseline) {
  const index = new Map()
  for (const key of baseline) {
    const cut = key.indexOf(" | ")
    const page = templatePage(key.slice(0, cut))
    if (!page) continue
    const k = `${page.slot}${key.slice(cut)}`
    if (!index.has(k)) index.set(k, new Set())
    index.get(k).add(page.template)
  }
  return index
}

/**
 * Splits a run's gate failures in three. Report rules never count.
 * - `known`: the baseline holds this key.
 * - `inherited`: a template page's failure that the baseline holds for the same page kind and width of some
 *   template (`from`). A new template renders the storefront's shared header, card, gallery and footer, so their
 *   known debt shows on its pages too. It does not fail the run; it stays listed.
 * - `fresh`: the rest, the failures this run made. A block or the playground has no inherited class: a new block
 *   owns its failures.
 * `results`: `[{ target, results: [...] }]`; `baseline`: a Set of keys, always the whole baseline, `--only` too.
 */
export function compareWithBaseline(results, baseline) {
  const index = inheritedIndex(baseline)
  const fresh = []
  const inherited = []
  const known = []
  for (const t of results) {
    const page = templatePage(t.target)
    for (const r of t.results) {
      if (r.kind !== "gate") continue
      for (const f of r.failures) {
        const key = failureKey(t.target, r.rule, f.sig)
        const failure = { key, target: t.target, rule: r.rule, sig: f.sig, detail: f.detail }
        const from = page && index.get(`${page.slot} | ${r.rule} | ${f.sig}`)
        if (baseline.has(key)) known.push(failure)
        else if (from) inherited.push({ ...failure, from: [...from].sort() })
        else fresh.push(failure)
      }
    }
  }
  return { fresh, inherited, known }
}

/** Which targets a `--only` value selects: a template id, a block id (`hero/g`) or a playground anchor. */
export function matchesOnly(target, only) {
  if (!only.length) return true
  return only.some((o) => {
    const id = o.replace(/^block-/, "")
    if (target.kind === "template") return target.template === o
    if (target.kind === "block") return target.block === o || target.anchor === o || target.anchor === `block-${id}` || target.block.replace(/\//g, "-") === id
    return false
  })
}
