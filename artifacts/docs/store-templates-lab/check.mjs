#!/usr/bin/env node
/**
 * Машинная проверка лаборатории. Идентификатор каждой строки отказа = идентификатор
 * правила из design/quality-rules.md; правило без порога проверкой не становится.
 *
 *   node check.mjs                 # всё
 *   node check.mjs ferma moda      # только эти шаблоны
 *   node check.mjs --source        # только проверки исходников (без браузера)
 *
 * Выход: rc 0 — ни одного gate-нарушения; rc 1 — есть. report-правила печатаются
 * всегда и сборку не роняют: их порог зависит от замысла шаблона.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { launch, auditPage, auditContrast, VIEWPORTS, AXE_CORE } from "./lib/audit.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const PAGES = ["index", "catalog", "product"]
const argv = process.argv.slice(2)
const sourceOnly = argv.includes("--source")
const only = argv.filter((a) => !a.startsWith("--"))

const SCALE = [12, 16, 20, 25, 31, 39, 49]
const SPACE = [4, 8, 12, 16, 24, 32, 48, 64, 96, 128]
const RADII = [0, 6, 8, 12, 9999]
const ASPECTS = ["1 / 1", "4 / 5", "3 / 4", "3 / 2", "16 / 9", "21 / 9"]
const SCALE_TOKENS = /^--(text|lh|tr|space|r-|dur|container|measure|tap|control|weight|hairline|tracking|ease)/

const fails = []   // gate
const notes = []   // report
const add = (rule, where, msg) => fails.push({ rule, where, msg })
const note = (rule, where, msg) => notes.push({ rule, where, msg })

/* ═══════════════ 1. ИСХОДНИКИ ═══════════════ */

// QR-TOKENS: вне src/tokens/ не должно быть литерального цвета, кегля, отступа, радиуса, тени
const cssFiles = [
  ["src/base/elements.css", readFileSync(join(HERE, "src/base/elements.css"), "utf8")],
  ...readdirSync(join(HERE, "src/blocks"))
    .filter((d) => existsSync(join(HERE, "src/blocks", d, "style.css")))
    .map((d) => [`src/blocks/${d}/style.css`, readFileSync(join(HERE, "src/blocks", d, "style.css"), "utf8")]),
]
const COLOR_PROPS = /^(color|background|background-color|border(-\w+)?-color|outline-color|fill|stroke|box-shadow)$/
const LENGTH_PROPS = /^(font-size|padding|padding-\w+|margin|margin-\w+|gap|row-gap|column-gap|border-radius|inset\S*|top|right|bottom|left|width|height|min-\w+|max-\w+|letter-spacing|outline-offset|outline-width|border-width|border-\w+-width|translate)$/
for (const [file, src] of cssFiles) {
  const body = src.replace(/\/\*[\s\S]*?\*\//g, "")
  for (const m of body.matchAll(/([-a-z]+)\s*:\s*([^;{}]+)[;}]/g)) {
    const [, prop, rawVal] = m
    const val = rawVal.trim()
    const line = body.slice(0, m.index).split("\n").length
    if (COLOR_PROPS.test(prop) && /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(val)) {
      add("QR-TOKENS", `${file}:${line}`, `литеральный цвет в «${prop}: ${val}»`)
    }
    if (LENGTH_PROPS.test(prop)) {
      const stripped = val.replace(/var\([^)]*\)/g, "").replace(/calc\(|clamp\(/g, "")
      for (const n of stripped.matchAll(/(-?\d*\.?\d+)(px|rem)\b/g)) {
        if (Number(n[1]) !== 0) add("QR-TOKENS", `${file}:${line}`, `литеральный размер ${n[0]} в «${prop}»`)
      }
    }
  }
  // QR-MOTION: длительности только из токенов и не длиннее 240 мс
  for (const m of body.matchAll(/(transition|animation)[-a-z]*\s*:\s*([^;{}]+)/g)) {
    for (const d of m[2].matchAll(/(\d+)ms/g)) {
      if (Number(d[1]) > 240) add("QR-MOTION", file, `длительность ${d[0]} > 240ms`)
    }
  }
}
const tokensSrc = readFileSync(join(HERE, "src/tokens/base.css"), "utf8")
if (!/@media \(prefers-reduced-motion: reduce\)/.test(tokensSrc)) {
  add("QR-MOTION", "src/tokens/base.css", "нет блока prefers-reduced-motion")
}

// QR-PROSE: текст шаблонов — абзацами, без склеек и сверхдлинных предложений
const tplFiles = readdirSync(join(HERE, "src/templates")).filter((f) => f.endsWith(".json"))
const templates = tplFiles
  .map((f) => JSON.parse(readFileSync(join(HERE, "src/templates", f), "utf8")))
  .filter((t) => !only.length || only.includes(t.id))

const walkStrings = (node, fn) => {
  if (typeof node === "string") return fn(node)
  if (Array.isArray(node)) return node.forEach((n) => walkStrings(n, fn))
  if (node && typeof node === "object") return Object.values(node).forEach((n) => walkStrings(n, fn))
}
for (const t of templates) {
  walkStrings(t.pages, (s) => {
    if (s.length < 40) return
    if (/[.!?»][«"А-ЯЁA-Z]/.test(s)) add("QR-PROSE", t.id, `слипшиеся предложения: «…${s.slice(Math.max(0, s.search(/[.!?»][«"А-ЯЁA-Z]/) - 20), s.search(/[.!?»][«"А-ЯЁA-Z]/) + 25)}…»`)
    for (const sent of s.split(/(?<=[.!?])\s+/)) {
      if (sent.length > 400) add("QR-PROSE", t.id, `предложение длиной ${sent.length} знаков (> 400)`)
    }
    if (s.length > 600 && !/\n/.test(s)) add("QR-PROSE", t.id, `монолит ${s.length} знаков без абзацев`)
  })
  // QR-TOKEN-COVERAGE: шаблон не смеет двигать шкалу
  for (const k of Object.keys(t.tokens || {})) {
    if (SCALE_TOKENS.test(k)) add("QR-TOKEN-COVERAGE", t.id, `переопределён токен шкалы ${k}`)
  }
  for (const [k, v] of Object.entries(t.media || {})) {
    if (["card", "tile", "hero", "gallery"].includes(k) && !ASPECTS.includes(v)) {
      add("QR-IMG-ASPECT", t.id, `соотношение «${v}» для ${k} вне закрытого набора ${ASPECTS.join(" · ")}`)
    }
  }
  note("QR-TOKEN-COVERAGE", t.id,
    `палитра ${Object.keys(t.tokens).length} · шрифты ${t.fonts.display} + ${t.fonts.body} · плотность ${t.density} · колонок ${t.gridCols} · кадр ${t.media.card} ${t.media.fit}`)
}

if (sourceOnly) { report(); process.exit(fails.length ? 1 : 0) }

/* ═══════════════ 2. СТРАНИЦЫ В БРАУЗЕРЕ ═══════════════ */
const axeSource = readFileSync(AXE_CORE, "utf8")
const browser = await launch()

for (const t of templates) {
  const roleSizes = {}      // роль → размер, для сверки между страницами
  const aspectByRole = {}   // роль картинки → соотношение
  const cardSigs = new Map()

  for (const page of PAGES) {
    for (const [vp, cfg] of Object.entries(VIEWPORTS)) {
      const where = `${t.id}/${page}/${vp}`
      const ctx = await browser.newContext({
        viewport: { width: cfg.width, height: cfg.height },
        deviceScaleFactor: 1, isMobile: cfg.isMobile, hasTouch: cfg.hasTouch, locale: "ru-RU",
      })
      const p = await ctx.newPage()
      const errors = []
      p.on("pageerror", (e) => errors.push(String(e.message).slice(0, 120)))
      await p.goto(pathToFileURL(join(HERE, "dist", t.id, `${page}.html`)).href, { waitUntil: "load" })
      await p.evaluate(() => document.fonts.ready)
      await p.waitForTimeout(150)

      const a = await auditPage(p)
      const x = await p.evaluate(() => {
        const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
        const out = {}
        out.roles = {}
        for (const el of document.querySelectorAll("[data-role]")) {
          if (!vis(el)) continue
          const r = el.getAttribute("data-role")
          const size = Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10
          ;(out.roles[r] ||= []).push(size)
        }
        out.exempt = [...document.querySelectorAll("[data-type-exempt]")].map((e) =>
          Math.round(parseFloat(getComputedStyle(e).fontSize) * 10) / 10)
        // роли изображений
        out.imgRoles = {}
        for (const box of document.querySelectorAll("[data-img-role]")) {
          if (!vis(box)) continue
          const role = box.getAttribute("data-img-role")
          const r = box.getBoundingClientRect()
          const cs = getComputedStyle(box)
          ;(out.imgRoles[role] ||= []).push({
            ratio: Math.round((r.width / r.height) * 1000) / 1000,
            declared: cs.aspectRatio,
            bg: cs.backgroundColor,
            fit: box.querySelector("img") ? getComputedStyle(box.querySelector("img")).objectFit : null,
            empty: box.hasAttribute("data-empty"),
            w: Math.round(r.width), h: Math.round(r.height),
          })
        }
        // подпись карточки товара
        out.cards = [...document.querySelectorAll('[data-component="product-card"]')].map((c) => ({
          id: c.getAttribute("data-product"),
          sig: [...c.querySelectorAll("[data-role]")].map((e) => e.getAttribute("data-role")).join(">"),
          surface: (() => {
            const cs = getComputedStyle(c)
            const media = c.querySelector(".media")
            return cs.backgroundColor !== "rgba(0, 0, 0, 0)" || parseFloat(cs.borderTopWidth) > 0 ||
              (media && parseFloat(getComputedStyle(media).borderTopLeftRadius) > 0)
          })(),
        }))
        // цена
        out.prices = [...document.querySelectorAll('[data-role="price"],[data-role="card-price"]')].filter(vis).map((e) => ({
          text: e.textContent.trim().slice(0, 40),
          numeric: getComputedStyle(e).fontVariantNumeric,
          weight: getComputedStyle(e).fontWeight,
          size: getComputedStyle(e).fontSize,
        }))
        out.cardTitle = (() => { const e = document.querySelector('[data-role="card-title"]'); return e ? getComputedStyle(e).fontWeight + "/" + getComputedStyle(e).fontSize : null })()
        // прописные
        out.upper = [...document.querySelectorAll("*")].filter((el) => {
          if (!vis(el)) return false
          const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim()
          if (own.length < 4) return false
          const cs = getComputedStyle(el)
          const letters = own.replace(/[^A-Za-zА-Яа-яЁё]/g, "")
          if (letters.length < 4) return false                        // «ИНН», «В», «СБП» — аббревиатура, не крик
          const words = own.split(/\s+/).filter((w) => /[A-Za-zА-Яа-яЁё]{2,}/.test(w))
          const isUpper = cs.textTransform === "uppercase" || letters === letters.toUpperCase()
          if (!isUpper) return false
          if (words.length < 2 && letters.length <= 5) return false   // одно короткое слово — сокращение
          return !(parseFloat(cs.fontSize) <= 12 && parseFloat(cs.letterSpacing) / parseFloat(cs.fontSize) >= 0.06)
        }).map((el) => `${el.tagName.toLowerCase()} «${el.textContent.trim().slice(0, 30)}» ${getComputedStyle(el).fontSize}`)
        // галерея
        const gal = document.querySelector("[data-gallery]")
        out.gallery = gal ? {
          visible: [...gal.querySelectorAll("[data-gal-slide]")].filter((s) => !s.hidden).length,
          main: (() => { const m = gal.querySelector('[data-img-role="gallery"]'); const r = m.getBoundingClientRect(); return Math.round(r.width / r.height * 1000) / 1000 })(),
          thumb: (() => { const m = gal.querySelector('[data-img-role="thumb"]'); if (!m) return null; const r = m.getBoundingClientRect(); return Math.round(r.width / r.height * 1000) / 1000 })(),
        } : null
        // alt
        out.alts = [...document.querySelectorAll("img")].map((i) => ({
          alt: i.getAttribute("alt"), decorative: i.hasAttribute("data-decorative"),
          role: i.closest("[data-img-role]")?.getAttribute("data-img-role") || null,
        }))
        // иконки без подписи подряд в шапке
        out.iconRuns = [...document.querySelectorAll(".hdr-tools")].map((g) =>
          [...g.children].filter((c) => !c.textContent.trim() || c.querySelector("svg")).length)
        // полосы и вертикали
        const bands = [...document.querySelectorAll("[data-block]")].filter(vis)
        out.bandPads = [...new Set(bands.map((b) => getComputedStyle(b).paddingTop).filter((v) => parseFloat(v) > 0))]
        out.containers = [...new Set([...document.querySelectorAll(".container")].filter(vis)
          .map((c) => Math.round(c.getBoundingClientRect().left)))]
        // фокус меряется снаружи настоящим Tab: :focus-visible не встаёт от .focus()
        out.focusRing = null
        // самый длинный текстовый блок и ширина его колонки
        let longest = null
        for (const el of document.querySelectorAll("p,li,div")) {
          const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim()
          if (!own || !vis(el)) continue
          if (!longest || own.length > longest.len) longest = { len: own.length, w: Math.round(el.getBoundingClientRect().width) }
        }
        out.longest = longest
        return out
      })
      await p.keyboard.press("Tab")
      x.focusRing = await p.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body) return null
        const cs = getComputedStyle(el)
        return cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0
      })
      a.contrast = await auditContrast(p, axeSource)
      // Гигантский словесный знак футера объявлен декоративным (aria-hidden + data-type-exempt)
      // и потому выведен из-под контраста — но ЯВНО, строкой отчёта, а не молча.
      const decorative = a.contrast.filter((c) => /ft-mark/.test(c.target))
      if (decorative.length) note("QR-CONTRAST", where, `исключено как декоративное: ${decorative.map((c) => c.target).join(", ")}`)
      a.contrast = a.contrast.filter((c) => !/ft-mark/.test(c.target))

      /* ---- правила ---- */
      if (errors.length) add("QR-JS", where, `ошибка в скрипте: ${errors[0]}`)

      // QR-TYPE-SCALE
      const exempt = new Set(x.exempt)
      const sizes = a.type.sizes.map((s) => Number(s.px)).filter((s) => !exempt.has(s)).sort((p1, p2) => p1 - p2)
      for (const s of sizes) if (!SCALE.includes(s)) add("QR-TYPE-SCALE", where, `кегль ${s}px вне шкалы ${SCALE.join("/")}`)
      if (sizes.length > 8) add("QR-TYPE-SCALE", where, `различных кеглей ${sizes.length} > 8`)
      for (let i = 1; i < sizes.length; i += 1) {
        const r = sizes[i] / sizes[i - 1]
        if (r < 1.15) add("QR-TYPE-SCALE", where, `соседние кегли ${sizes[i - 1]}→${sizes[i]} отличаются в ${r.toFixed(2)} (< 1.15)`)
      }
      // QR-WEIGHT
      for (const w of a.type.weights) if (Number(w.weight) > 600) add("QR-WEIGHT", where, `вес ${w.weight} > 600`)
      // QR-CASE
      for (const u of x.upper) add("QR-CASE", where, `прописные вне надглавия: ${u}`)
      // QR-HEADING-RANK
      const hs = a.headings
      if (hs.filter((h) => h.level === 1).length !== 1) add("QR-HEADING-RANK", where, `h1 на странице: ${hs.filter((h) => h.level === 1).length} (нужен ровно один)`)
      const byLevel = {}
      for (const h of hs) byLevel[h.level] = Math.max(byLevel[h.level] || 0, parseFloat(h.size))
      const levels = Object.keys(byLevel).map(Number).sort()
      for (let i = 1; i < levels.length; i += 1) {
        if (levels[i] - levels[i - 1] > 1) add("QR-HEADING-RANK", where, `пропущен уровень между h${levels[i - 1]} и h${levels[i]}`)
        if (byLevel[levels[i]] > byLevel[levels[i - 1]]) add("QR-HEADING-RANK", where, `h${levels[i]} (${byLevel[levels[i]]}px) крупнее h${levels[i - 1]} (${byLevel[levels[i - 1]]}px)`)
      }
      // QR-SECTION-RANK
      const sec = x.roles["section-title"]?.[0], body = x.roles.body?.[0]
      if (sec && body && sec / body < 1.5) add("QR-SECTION-RANK", where, `заголовок раздела ${sec}px к телу ${body}px = ${(sec / body).toFixed(2)} (< 1.5)`)
      // QR-TYPE-ROLE (сверка между страницами одного вьюпорта)
      for (const [role, list] of Object.entries(x.roles)) {
        const uniq = [...new Set(list)]
        if (uniq.length > 1) add("QR-TYPE-ROLE", where, `роль ${role} имеет ${uniq.length} кегля на одной странице: ${uniq.join(", ")}`)
        const key = `${role}@${vp}`
        if (roleSizes[key] === undefined) roleSizes[key] = uniq[0]
        else if (roleSizes[key] !== uniq[0]) add("QR-TYPE-ROLE", where, `роль ${role}: ${uniq[0]}px здесь против ${roleSizes[key]}px на другой странице`)
      }
      // QR-SPACE-SCALE
      for (const s of a.spacing) {
        const v = Number(s.px)
        if (!SPACE.includes(v)) add("QR-SPACE-SCALE", where, `отступ ${v}px вне шкалы (×${s.count})`)
      }
      // QR-RADIUS
      for (const r of a.radii) if (!RADII.includes(Number(r.px))) add("QR-RADIUS", where, `радиус ${r.px}px вне токенов`)
      // QR-ELEVATION
      if (a.shadows.length > 1) add("QR-ELEVATION", where, `рецептур тени ${a.shadows.length} > 1`)
      // QR-SECTION-RHYTHM (report)
      if (x.bandPads.length > 2) note("QR-SECTION-RHYTHM", where, `зазоров полос ${x.bandPads.length}: ${x.bandPads.join(", ")}`)
      // QR-GRID-AXES
      if (x.containers.length > 1) add("QR-GRID-AXES", where, `контейнеры на разных левых краях: ${x.containers.join(", ")}`)
      // QR-OVERFLOW
      if (vp === "mobile" && a.overflowX.overflow > 0) {
        add("QR-OVERFLOW", where, `переполнение ${a.overflowX.overflow}px; первые: ${a.overflowX.offenders.slice(0, 3).map((o) => o.el).join(" | ")}`)
      }
      // QR-HIT
      if (vp === "mobile") for (const h of a.hitAreasSmall) {
        if (h.wrappedInLabel) continue   // цель — подпись целиком, она держит 44px
        if (h.h < 44) add("QR-HIT", where, `высота цели ${h.h} < 44: ${h.el}`)
        else if (h.iconOnly && h.w < 44) add("QR-HIT", where, `ширина цели без подписи ${h.w} < 44: ${h.el}`)
      }
      // QR-CONTRAST
      for (const c of a.contrast) add("QR-CONTRAST", where, `${c.target}: ${c.data?.ratio} при ${c.data?.expected}`)
      // QR-FOCUS
      if (x.focusRing === false) add("QR-FOCUS", where, "у интерактивного элемента нет видимого кольца фокуса")
      // QR-IMG-ASPECT
      for (const [role, list] of Object.entries(x.imgRoles)) {
        const ratios = [...new Set(list.map((i) => i.ratio))]
        if (ratios.length > 1) add("QR-IMG-ASPECT", where, `роль ${role}: ${ratios.length} соотношения на странице — ${ratios.join(", ")}`)
        for (const i of list) {
          if (i.declared === "auto") add("QR-IMG-ASPECT", where, `роль ${role}: коробка без aspect-ratio`)
          if (!i.w || !i.h) add("QR-IMG-ASPECT", where, `роль ${role}: коробка отрисована ${i.w}×${i.h}`)
        }
        const key = `${role}@${vp}`
        if (aspectByRole[key] === undefined) aspectByRole[key] = ratios[0]
        else if (Math.abs(aspectByRole[key] - ratios[0]) > 0.01) {
          add("QR-IMG-ASPECT", where, `роль ${role}: ${ratios[0]} здесь против ${aspectByRole[key]} на другой странице`)
        }
      }
      // QR-IMG-FRAME: карточки и плитки — одна подложка, один режим вписывания
      const framed = [...(x.imgRoles.card || []), ...(x.imgRoles.tile || [])].filter((i) => !i.empty)
      const bgs = [...new Set(framed.map((i) => i.bg))]
      if (bgs.length > 1) add("QR-IMG-FRAME", where, `подложек под кадрами ${bgs.length}: ${bgs.join(" | ")}`)
      const fits = [...new Set(framed.map((i) => i.fit).filter(Boolean))]
      if (fits.length > 1) add("QR-IMG-FRAME", where, `режимов вписывания ${fits.length}: ${fits.join(", ")}`)
      // QR-CARD-SURFACE + QR-CARD-GRAMMAR
      for (const c of x.cards) {
        if (!c.surface) add("QR-CARD-SURFACE", where, `карточка ${c.id} без собственной поверхности`)
        const prev = cardSigs.get(c.id)
        if (prev && prev.sig !== c.sig) add("QR-CARD-GRAMMAR", where, `карточка ${c.id}: подпись «${c.sig}» против «${prev.sig}» на ${prev.where}`)
        if (!prev) cardSigs.set(c.id, { sig: c.sig, where })
      }
      const CANON = ["card-media", "card-body", "card-badge", "card-title", "card-price", "card-price-old", "card-meta"]
      for (const sig of new Set(x.cards.map((c) => c.sig))) {
        let i = 0, ok = true
        for (const r of sig.split(">")) { const j = CANON.indexOf(r, i); if (j < 0) { ok = false; break } i = j }
        if (!ok) add("QR-CARD-GRAMMAR", where, `подпись «${sig}» не следует канону ${CANON.join(">")}`)
      }
      // QR-PRICE
      for (const pr of x.prices) {
        if (!/tabular-nums/.test(pr.numeric)) add("QR-PRICE", where, `цена без tabular-nums: «${pr.text}»`)
        if (/,00/.test(pr.text)) add("QR-PRICE", where, `цена с нулевыми копейками: «${pr.text}»`)
        if (/₽/.test(pr.text) && !/\u00a0₽/.test(pr.text)) add("QR-PRICE", where, `перед ₽ нет неразрывного пробела: «${pr.text}»`)
      }
      if (x.cardTitle && x.prices.length) {
        const cp = x.prices.find((p) => p.size === x.cardTitle.split("/")[1])
        if (cp && cp.weight === x.cardTitle.split("/")[0]) add("QR-PRICE", where, "цена карточки не отличается от названия ни весом, ни кеглем")
      }
      // QR-ALT
      for (const im of x.alts) {
        if (im.decorative) { if (im.alt !== "") add("QR-ALT", where, `декоративная картинка с непустым alt «${im.alt}»`); continue }
        if (!im.alt) add("QR-ALT", where, "контентная картинка с пустым alt")
        else if (/^(product|thumbnail|image|photo)\s*\d*$/i.test(im.alt)) add("QR-ALT", where, `служебная заглушка в alt: «${im.alt}»`)
      }
      // QR-EMPTY
      for (const e of (x.imgRoles.card || []).filter((i) => i.empty)) {
        if (e.declared === "auto") add("QR-EMPTY", where, "заглушка вне коробки соотношения")
      }
      // QR-GALLERY
      if (x.gallery) {
        if (x.gallery.visible !== 1) add("QR-GALLERY", where, `одновременно видно кадров: ${x.gallery.visible} (нужен один)`)
        if (x.gallery.thumb !== null && Math.abs(x.gallery.main - x.gallery.thumb) > 0.01) {
          add("QR-GALLERY", where, `миниатюра ${x.gallery.thumb} ≠ кадр ${x.gallery.main}`)
        }
      }
      if (page === "product" && vp === "desktop" && a.density.pageHeight > 6000) {
        add("QR-GALLERY", where, `страница товара ${a.density.pageHeight}px > 6000`)
      }
      // QR-CONTROL-DENSITY
      for (const n of x.iconRuns) if (n > 4) add("QR-CONTROL-DENSITY", where, `иконок подряд в шапке: ${n} > 4`)
      // QR-MEASURE / QR-COLUMN-RANK / QR-DENSITY — только десктоп
      if (vp === "desktop") {
        for (const l of a.lineLength) {
          if (l.cpl > 90) add("QR-MEASURE", where, `${l.cpl} знаков в строке (> 90): ${l.el}`)
          if (l.prose && l.cpl < 45) add("QR-MEASURE", where, `проза ${l.cpl} знаков в строке (< 45): ${l.el}`)
        }
        if (x.longest && x.longest.len > 200 && x.longest.w < 480) {
          add("QR-COLUMN-RANK", where, `самый длинный текст (${x.longest.len} знаков) в колонке ${x.longest.w}px < 480`)
        }
        note("QR-DENSITY", where, `текстовых элементов до сгиба ${a.density.textAboveFold} · высота ${a.density.pageHeight}px`)
      }
      await ctx.close()
    }
  }
}
await browser.close()

function report() {
  const byRule = {}
  for (const f of fails) (byRule[f.rule] ||= []).push(f)
  if (notes.length) {
    console.log("── report ──")
    for (const n of notes) console.log(`  ${n.rule.padEnd(20)} ${n.where.padEnd(26)} ${n.msg}`)
  }
  if (!fails.length) { console.log("\n── gate ──\n  0 нарушений"); return }
  console.log("\n── gate ──")
  for (const [rule, list] of Object.entries(byRule).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${rule} — ${list.length}`)
    for (const f of list.slice(0, 6)) console.log(`      ${f.where}: ${f.msg}`)
    if (list.length > 6) console.log(`      … ещё ${list.length - 6}`)
  }
  console.log(`\n  ИТОГО нарушений: ${fails.length}`)
}
report()
process.exit(fails.length ? 1 : 0)
