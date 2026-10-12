// The in-page half of `pnpm template:check` (t-2026-10-12-33): what the browser measures on one target, a whole
// page or one block anchor of the playground. These functions run inside the page through `page.evaluate`, so
// each is self-contained: no imports, no closure over this module. They return FACTS, never verdicts; the
// thresholds live in `./rules.mjs`, the way the lab split `lib/audit.mjs` from `check.mjs`
// (origin/feat/day16-store-templates-lab, artifacts/docs/store-templates-lab/).
//
// The lab marked its DOM with `data-role` / `data-img-role`; the storefront has its own markers, mapped here once:
//   product card      [data-testid="product-wrapper"]
//   card title        [data-testid="product-title"]
//   card price        [data-testid="price"], old price [data-testid="original-price"]
//   page price        [data-testid="product-price"]
//   picture frame     [data-product-media="card|gallery|line"], [data-product-media-state="placeholder"]
//   page title        h1; section title: h2 inside <main> (inside the block on a block target)
//   content container .content-container

/**
 * Every fact one rule needs, measured on `scope` (a CSS selector, or the whole body).
 * @param {{ scope: string | null, block: boolean }} opts
 */
export function measureTarget({ scope, block }) {
  const root = scope ? document.querySelector(scope) : document.body
  if (!root) return { missing: true }

  const hiddenCache = new WeakMap()
  const fadedOut = (el) => {
    // An element under an ancestor at opacity 0 (a hover image waiting for the mouse) is not on screen.
    if (!el || el === document.documentElement) return false
    if (hiddenCache.has(el)) return hiddenCache.get(el)
    const own = getComputedStyle(el).opacity === "0"
    const value = own || fadedOut(el.parentElement)
    hiddenCache.set(el, value)
    return value
  }
  const IGNORED = "nextjs-portal, script, style, noscript, template, svg *"
  const shown = (el) => {
    if (el.closest(IGNORED)) return false
    const r = el.getBoundingClientRect()
    // 1×1 is the visually-hidden pattern (sr-only): read by a screen reader, never seen.
    if (r.width <= 1 && r.height <= 1) return false
    if (!r.width || !r.height) return false
    const cs = getComputedStyle(el)
    if (cs.visibility === "hidden" || cs.display === "none") return false
    return !fadedOut(el)
  }
  const all = [...root.querySelectorAll("*")].filter(shown)

  const ownText = (el) =>
    [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join("")
      .replace(/\s+/g, " ")
      .trim()
  const label = (el) => {
    const testid = el.getAttribute("data-testid")
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/)[0] : ""
    const text = (el.textContent || el.getAttribute("aria-label") || el.getAttribute("alt") || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 28)
    return `${el.tagName.toLowerCase()}${testid ? `[${testid}]` : cls ? `.${cls}` : ""}${text ? ` «${text}»` : ""}`
  }
  const px = (v) => Math.round(parseFloat(v) * 100) / 100
  const bump = (map, key, sample) => {
    const cur = map.get(key) || { count: 0, samples: [] }
    cur.count += 1
    if (sample && cur.samples.length < 3 && !cur.samples.includes(sample)) cur.samples.push(sample)
    map.set(key, cur)
  }
  const dump = (map) => [...map.entries()].map(([value, v]) => ({ value, count: v.count, samples: v.samples }))
  const vw = document.documentElement.clientWidth
  const vh = window.innerHeight
  const inMain = (el) => block || Boolean(el.closest("main"))
  const out = { block, viewport: { width: vw, height: vh } }

  /* ---- type: only elements with text of their own (lab: hasOwnText) ---- */
  const sizes = new Map()
  const weights = new Map()
  const upper = []
  const lines = []
  const canvas = document.createElement("canvas").getContext("2d")
  const SAMPLE = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя оеаинтсрвл etaoinshrdlu"
  for (const el of all) {
    const text = ownText(el)
    if (!text) continue
    const cs = getComputedStyle(el)
    bump(sizes, px(cs.fontSize), label(el))
    bump(weights, Number(cs.fontWeight), label(el))

    // QR-CASE, the lab's own filter: an abbreviation («СБП», «USD») is not shouting.
    const letters = text.replace(/[^A-Za-zА-Яа-яЁё]/g, "")
    if (letters.length >= 4) {
      const words = text.split(/\s+/).filter((w) => /[A-Za-zА-Яа-яЁё]{2,}/.test(w))
      const isUpper = cs.textTransform === "uppercase" || letters === letters.toUpperCase()
      if (isUpper && !(words.length < 2 && letters.length <= 5)) {
        const size = parseFloat(cs.fontSize)
        const tracking = cs.letterSpacing === "normal" ? 0 : parseFloat(cs.letterSpacing) / size
        upper.push({ el: label(el), size, tracking: Math.round(tracking * 1000) / 1000 })
      }
    }

    // QR-MEASURE: characters per line, canvas width of an average character (lab: lib/audit.mjs).
    if (text.length >= 80) {
      canvas.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      const avg = canvas.measureText(SAMPLE).width / SAMPLE.length
      const r = el.getBoundingClientRect()
      const inner = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const prose = Boolean(el.closest('[data-testid*="description"], .prose, article'))
      lines.push({ el: label(el), cpl: Math.round(inner / avg), width: Math.round(inner), prose })
    }
  }
  out.type = { sizes: dump(sizes), weights: dump(weights) }
  out.upper = upper
  out.lines = lines.sort((a, b) => b.cpl - a.cpl).slice(0, 20)

  // QR-COLUMN-RANK: the longest own text of the target and the width of its column.
  let longest = null
  for (const el of all) {
    if (!/^(P|LI|DIV|SPAN)$/.test(el.tagName)) continue
    const text = ownText(el)
    if (text && (!longest || text.length > longest.len)) {
      longest = { len: text.length, width: Math.round(el.getBoundingClientRect().width), el: label(el) }
    }
  }
  out.longest = longest

  /* ---- headings and roles ---- */
  out.headings = [...root.querySelectorAll("h1,h2,h3,h4,h5,h6")]
    .filter(shown)
    .map((h) => ({ level: Number(h.tagName[1]), size: px(getComputedStyle(h).fontSize), el: label(h) }))
  const roleSizes = (selector, filter = () => true) =>
    [...root.querySelectorAll(selector)].filter((el) => shown(el) && filter(el)).map((el) => px(getComputedStyle(el).fontSize))
  out.roles = {
    "page-title": roleSizes("h1"),
    "section-title": roleSizes("h2", inMain),
    // Inside a card only: the product page's own h1 carries `data-testid="product-title"` too.
    "card-title": roleSizes('[data-testid="product-wrapper"] [data-testid="product-title"]'),
    "card-price": roleSizes('[data-testid="product-wrapper"] [data-testid="price"]'),
    price: roleSizes('[data-testid="product-price"]'),
  }
  const bodySizes = new Map()
  for (const p of root.querySelectorAll("p")) {
    if (shown(p) && inMain(p) && ownText(p).length >= 40) bump(bodySizes, px(getComputedStyle(p).fontSize))
  }
  const bodyMode = dump(bodySizes).sort((a, b) => b.count - a.count)[0]
  out.body = bodyMode ? bodyMode.value : null

  /* ---- spacing: non-zero padding, vertical margin and gap (lab: margin-inline is centring, not rhythm) ---- */
  const space = new Map()
  const PROPS = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "marginTop", "marginBottom", "rowGap", "columnGap"]
  for (const el of all) {
    const cs = getComputedStyle(el)
    for (const p of PROPS) {
      const raw = cs[p]
      if (!raw || raw === "normal" || raw === "auto") continue
      const v = px(raw)
      if (v && !Number.isNaN(v)) bump(space, Math.abs(v), label(el))
    }
  }
  out.spacing = dump(space)

  /* ---- radius, elevation ---- */
  const radius = new Map()
  for (const el of all) {
    const raw = getComputedStyle(el).borderTopLeftRadius
    if (!raw || raw === "0px") continue
    const value = raw.endsWith("%") || parseFloat(raw) >= 999 ? "pill" : px(raw)
    bump(radius, value, label(el))
  }
  out.radii = dump(radius)
  const radiusOf = (selector) => {
    const el = [...root.querySelectorAll(selector)].find(shown)
    if (!el) return null
    const raw = getComputedStyle(el).borderTopLeftRadius
    return raw.endsWith("%") || parseFloat(raw) >= 999 ? "pill" : px(raw)
  }
  out.roleRadii = {
    card: radiusOf('[data-testid="product-wrapper"]'),
    "card-media": radiusOf('[data-product-media="card"]'),
    gallery: radiusOf('[data-product-media="gallery"]'),
  }
  const rootStyle = getComputedStyle(document.documentElement)
  const radiusVar = rootStyle.getPropertyValue("--radius").trim()
  out.radiusVar = radiusVar ? (radiusVar.endsWith("rem") ? parseFloat(radiusVar) * parseFloat(rootStyle.fontSize) : parseFloat(radiusVar)) : null

  // A box-shadow is split into layers; transparent layers (Tailwind's empty ring slots) are dropped, and a recipe
  // whose every layer is 0 0 0 <spread> is a ring drawn as a border, not elevation.
  const layers = (value) =>
    value
      .split(/,(?![^(]*\))/)
      .map((l) => l.trim())
      .filter((l) => l && !/rgba\([^)]*,\s*0\)/.test(l) && !/transparent/.test(l))
  const shadows = new Map()
  for (const el of all) {
    const v = getComputedStyle(el).boxShadow
    if (!v || v === "none") continue
    const kept = layers(v)
    if (!kept.length) continue
    const elevated = kept.some((l) => {
      const nums = (l.replace(/rgba?\([^)]*\)/g, "").match(/-?\d*\.?\d+px/g) || []).map(parseFloat)
      return nums.length >= 3 && (nums[1] !== 0 || nums[2] !== 0)
    })
    if (elevated) bump(shadows, kept.join(", ").slice(0, 160), label(el))
  }
  out.shadows = dump(shadows)

  /* ---- pictures ---- */
  out.frames = [...root.querySelectorAll("[data-product-media]")].filter(shown).map((box) => {
    const r = box.getBoundingClientRect()
    const cs = getComputedStyle(box)
    const img = [...box.querySelectorAll("img")].find((i) => !i.closest('[aria-hidden="true"]'))
    return {
      role: box.getAttribute("data-product-media"),
      state: box.getAttribute("data-product-media-state"),
      ratio: Math.round((r.width / r.height) * 1000) / 1000,
      declared: cs.aspectRatio,
      bg: cs.backgroundColor,
      fit: img ? getComputedStyle(img).objectFit : null,
      w: Math.round(r.width),
      h: Math.round(r.height),
    }
  })
  out.images = [...root.querySelectorAll("img")]
    .filter((img) => !img.closest(IGNORED))
    .map((img) => {
      const r = img.getBoundingClientRect()
      const cs = getComputedStyle(img)
      const parent = img.parentElement
      const parentShown = parent ? shown(parent) : false
      return {
        el: label(img),
        alt: img.getAttribute("alt"),
        decorative: Boolean(img.closest('[aria-hidden="true"]')) || img.getAttribute("role") === "presentation",
        product: Boolean(img.closest("[data-product-media]")),
        hardBox:
          cs.aspectRatio !== "auto" ||
          (img.hasAttribute("width") && img.hasAttribute("height")) ||
          cs.position === "absolute" ||
          cs.position === "fixed",
        shown: shown(img),
        zero: parentShown && cs.display !== "none" && (r.width < 1 || r.height < 1),
      }
    })

  /* ---- product card grammar, surface, price ---- */
  const CARD_ROLES = [
    ["[data-product-media]", "card-media"],
    ['[data-testid="product-sale-badge"]', "card-badge"],
    ['[data-testid="product-title"]', "card-title"],
    ['[data-testid="price"]', "card-price"],
    ['[data-testid="original-price"]', "card-price-old"],
    ['[data-testid="product-unit"]', "card-meta"],
    ['[data-testid="product-excerpt"]', "card-meta"],
  ]
  out.cards = [...root.querySelectorAll('[data-testid="product-wrapper"]')].filter(shown).map((card) => {
    const sig = []
    for (const el of card.querySelectorAll("*")) {
      const hit = CARD_ROLES.find(([sel]) => el.matches(sel))
      if (hit && sig[sig.length - 1] !== hit[1]) sig.push(hit[1])
    }
    const cs = getComputedStyle(card)
    const media = card.querySelector("[data-product-media]")
    let href = card.getAttribute("href") || ""
    try {
      href = new URL(href, location.href).pathname
    } catch {}
    return {
      href,
      sig: sig.join(">"),
      surface:
        cs.backgroundColor !== "rgba(0, 0, 0, 0)" ||
        parseFloat(cs.borderTopWidth) > 0 ||
        Boolean(media && parseFloat(getComputedStyle(media).borderTopLeftRadius) > 0),
    }
  })
  out.prices = [...root.querySelectorAll('[data-testid="price"], [data-testid="product-price"], [data-testid="original-price"]')]
    .filter(shown)
    .map((el) => {
      const cs = getComputedStyle(el)
      return { el: label(el), text: el.textContent.trim().slice(0, 40), numeric: cs.fontVariantNumeric, weight: cs.fontWeight, size: cs.fontSize }
    })
  const title = [...root.querySelectorAll('[data-testid="product-wrapper"] [data-testid="product-title"]')].find(shown)
  out.cardTitle = title ? { weight: getComputedStyle(title).fontWeight, size: getComputedStyle(title).fontSize } : null

  /* ---- overflow ---- */
  const clipped = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      if (/(hidden|auto|scroll|clip)/.test(getComputedStyle(a).overflowX)) return true
      if (a === root) break
    }
    return false
  }
  const over = all.filter((el) => {
    const r = el.getBoundingClientRect()
    return (r.right > vw + 1 || r.left < -1) && !clipped(el)
  })
  out.overflow = {
    px: block
      ? Math.max(0, ...over.map((el) => Math.round(el.getBoundingClientRect().right - vw)))
      : document.documentElement.scrollWidth - document.documentElement.clientWidth,
    offenders: over.slice(0, 5).map(label),
  }

  /* ---- hit size (lab: WCAG 2.5.8, an inline link inside a paragraph is exempt) ---- */
  const INTERACTIVE = "a[href],button,[role=button],input:not([type=hidden]),select,textarea,summary"
  out.hits = [...root.querySelectorAll(INTERACTIVE)]
    .filter(shown)
    .map((el) => {
      const r = el.getBoundingClientRect()
      const p = el.parentElement
      const inline =
        el.tagName === "A" &&
        Boolean(p) &&
        getComputedStyle(el).display === "inline" &&
        (p.textContent || "").trim().length > (el.textContent || "").trim().length + 10
      const label_ = el.closest("label")
      return {
        el: label(el),
        w: Math.round(r.width),
        h: Math.round(r.height),
        inline,
        iconOnly: !(el.textContent || "").trim() && Boolean(el.querySelector("svg,img")),
        wrappedInLabel:
          /^(checkbox|radio)$/.test(el.getAttribute("type") || "") && Boolean(label_) && label_.getBoundingClientRect().height >= 44,
      }
    })
    .filter((h) => !h.inline && (h.w < 44 || h.h < 44))

  /* ---- icon-only controls in one row of a header (lab: QR-CONTROL-DENSITY) ---- */
  const headers = block ? [root, ...root.querySelectorAll("header")] : [...document.querySelectorAll("header")]
  const runs = new Map()
  for (const header of headers) {
    for (const el of header.querySelectorAll("a[href],button")) {
      if (!shown(el) || (el.textContent || "").trim() || !el.querySelector("svg,img")) continue
      let row = el.parentElement
      while (row && row !== header && !/flex/.test(getComputedStyle(row).display)) row = row.parentElement
      // Wrapped one per box, a control's own flex box is not the row: climb while the box holds only this control.
      while (row && row !== header && row.querySelectorAll("a[href],button").length < 2) row = row.parentElement
      if (row) bump(runs, row, label(el))
    }
  }
  out.iconRun = Math.max(0, ...[...runs.values()].map((v) => v.count))

  /* ---- page structure: density, grid axes, band gaps, footer ---- */
  out.textAboveFold = all.filter((el) => {
    const r = el.getBoundingClientRect()
    return r.top < vh && r.bottom > 0 && ownText(el)
  }).length
  out.pageHeight = document.documentElement.scrollHeight
  out.containerEdges = [
    ...new Set(
      [...root.querySelectorAll(".content-container")].filter(shown).map((c) => Math.round(c.getBoundingClientRect().left))
    ),
  ].sort((a, b) => a - b)
  const main = block ? root : document.querySelector("main")
  let bands = main ? [...main.children].filter(shown) : []
  // Wrappers of one child are not bands: go down to the first level that holds several.
  for (let depth = 0; bands.length === 1 && depth < 4; depth += 1) bands = [...bands[0].children].filter(shown)
  const gaps = new Set()
  for (let i = 1; i < bands.length; i += 1) {
    const g = Math.round(bands[i].getBoundingClientRect().top - bands[i - 1].getBoundingClientRect().bottom)
    if (g > 0) gaps.add(g)
  }
  out.bandGaps = [...gaps].sort((a, b) => a - b)
  const surface = (el) => {
    for (let a = el; a; a = a.parentElement) {
      const bg = getComputedStyle(a).backgroundColor
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg
    }
    return "rgb(255, 255, 255)"
  }
  const footer = block ? null : document.querySelector("footer")
  out.footer = footer ? { footer: surface(footer), page: surface(document.body) } : null

  /* ---- gallery (lab: QR-GALLERY) ---- */
  const hero = [...root.querySelectorAll('[data-product-media="gallery"]')].filter(shown)
  const thumb = [...root.querySelectorAll('[data-testid^="product-gallery-thumbnail-"]')].find(shown)
  const ratioOf = (el) => {
    const r = el.getBoundingClientRect()
    return Math.round((r.width / r.height) * 1000) / 1000
  }
  out.gallery = hero.length ? { frames: hero.length, main: ratioOf(hero[0]), thumb: thumb ? ratioOf(thumb) : null } : null

  /* ---- an empty-state anchor draws nothing, or something with content in it ---- */
  const rr = root.getBoundingClientRect()
  out.drawn = {
    h: Math.round(rr.height),
    text: (root.innerText || "").trim().length,
    media: [...root.querySelectorAll("img,svg,video,canvas")].filter(shown).length,
  }

  /* ---- occlusion: what is really at the point of a title, a price, a button (lab: QR-OCCLUSION) ---- */
  out.occluded = []
  const pinned = (el) => {
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      if (/^(fixed|sticky)$/.test(getComputedStyle(a).position)) return true
    }
    return false
  }
  for (const el of root.querySelectorAll('h1,h2,h3,[data-testid="price"],[data-testid="product-price"],button,a[role="button"]')) {
    if (!shown(el)) continue
    const r = el.getBoundingClientRect()
    if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > vh || r.left < 0 || r.right > vw) continue
    const x = Math.round(r.left + r.width / 2)
    const y = Math.round(r.top + Math.min(r.height / 2, 12))
    const hit = document.elementFromPoint(x, y)
    if (!hit || hit === el || el.contains(hit) || hit.contains(el)) continue
    // A bar pinned to the viewport moves with the scroll; it covers whatever passes under it, by design.
    if (pinned(hit) || hit.closest("nextjs-portal")) continue
    out.occluded.push({ el: label(el), by: label(hit) })
  }
  return out
}

/** Transition and animation lengths on the target, in ms (QR-MOTION). Measured twice: as is and under reduce. */
export function measureMotion({ scope }) {
  const root = scope ? document.querySelector(scope) : document.body
  if (!root) return { max: 0, offenders: [] }
  const ms = (list) => Math.max(0, ...list.split(",").map((v) => (v.trim().endsWith("ms") ? parseFloat(v) : parseFloat(v) * 1000)))
  const offenders = []
  let max = 0
  for (const el of root.querySelectorAll("*")) {
    const cs = getComputedStyle(el)
    if (cs.display === "none") continue
    const t = cs.transitionProperty === "none" ? 0 : ms(cs.transitionDuration)
    const a = cs.animationName === "none" ? 0 : ms(cs.animationDuration)
    const d = Math.round(Math.max(t, a))
    if (d > max) max = d
    if (d > 0) {
      const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/)[0] : ""
      offenders.push({ ms: d, kind: a >= t ? "animation" : "transition", el: `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}` })
    }
  }
  return { max, offenders }
}

/**
 * Focus rings (QR-FOCUS). The caller presses Tab once first: after a keyboard focus Chromium keeps
 * `:focus-visible` for a focus moved by script, so every target here is focused as a keyboard user reaches it.
 */
export function measureFocus({ scope, limit }) {
  const root = scope ? document.querySelector(scope) : document.body
  if (!root) return []
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([type=hidden]):not([disabled]),select,textarea,summary,[tabindex]:not([tabindex="-1"])'
  const shown = (el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest("nextjs-portal")
  }
  const ring = (el) => {
    const snap = (cs) => [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow].join("|")
    const own = getComputedStyle(el)
    return {
      own: snap(own),
      outline: own.outlineStyle !== "none" && parseFloat(own.outlineWidth) > 0 && !/rgba\([^)]*,\s*0\)/.test(own.outlineColor),
      after: snap(getComputedStyle(el, "::after")),
      before: snap(getComputedStyle(el, "::before")),
      parent: el.parentElement ? snap(getComputedStyle(el.parentElement)) : "",
    }
  }
  const label = (el) => {
    const testid = el.getAttribute("data-testid")
    const text = (el.textContent || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 28)
    return `${el.tagName.toLowerCase()}${testid ? `[${testid}]` : ""}${text ? ` «${text}»` : ""}`
  }
  const out = []
  for (const el of [...root.querySelectorAll(FOCUSABLE)].filter(shown).slice(0, limit)) {
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur()
    const rest = ring(el)
    el.focus({ preventScroll: true })
    if (document.activeElement !== el) continue
    const on = ring(el)
    const visible =
      on.outline || on.own !== rest.own || on.after !== rest.after || on.before !== rest.before || on.parent !== rest.parent
    out.push({ el: label(el), visible })
  }
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur()
  return out
}

/** Text contrast by axe-core's own `color-contrast` rule (lab: QR-CONTRAST); axe is injected by the caller. */
export async function measureContrast({ scope }) {
  const root = scope ? document.querySelector(scope) : document
  if (!root || !window.axe) return { error: "axe-core is not on the page" }
  const res = await window.axe.run(root, { runOnly: { type: "rule", values: ["color-contrast"] }, resultTypes: ["violations"] })
  const label = (el) => {
    if (!el) return "?"
    const testid = el.getAttribute("data-testid")
    const text = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 28)
    return `${el.tagName.toLowerCase()}${testid ? `[${testid}]` : ""}${text ? ` «${text}»` : ""}`
  }
  return {
    violations: (res.violations || []).flatMap((v) =>
      v.nodes.map((n) => {
        let el = null
        try {
          el = document.querySelector(String(n.target[0]))
        } catch {}
        const data = n.any?.[0]?.data || {}
        return { el: label(el), ratio: data.contrastRatio ?? null, expected: data.expectedContrastRatio ?? null }
      })
    ),
  }
}
