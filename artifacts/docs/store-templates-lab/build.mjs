#!/usr/bin/env node
/**
 * Генератор лаборатории: токены + библиотека блоков + один JSON на шаблон → страницы.
 *
 *   node build.mjs            # собрать всё
 *   node build.mjs ferma      # только эти шаблоны
 *
 * Идемпотентность (критерий приёмки): файл переписывается ТОЛЬКО если содержимое
 * изменилось, и прогон печатает, сколько файлов реально тронуто. Второй прогон
 * подряд обязан напечатать «изменено 0».
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { esc, map } from "./src/lib/html.mjs"
import { packshot, scene, heroArt, tileArt, KIND_BY_CATEGORY } from "./src/lib/media.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, "src")
const DIST = join(HERE, "dist")
const ASSETS = join(HERE, "assets")
const PAGES = ["index", "catalog", "product"]

let touched = 0
function put(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  if (existsSync(path) && readFileSync(path, "utf8") === content) return false
  writeFileSync(path, content)
  touched += 1
  return true
}

/* ---------- 1. блоки ---------- */
const blockDirs = readdirSync(join(SRC, "blocks")).sort()
const blocks = {}
for (const d of blockDirs) {
  const entry = join(SRC, "blocks", d, "index.mjs")
  if (!existsSync(entry)) continue
  const mod = await import(pathToFileURL(entry).href)
  if (mod.render) blocks[mod.meta.id] = mod.render
}

/* ---------- 2. общий CSS и JS ---------- */
const cssParts = [
  `/* СГЕНЕРИРОВАНО node build.mjs — правь src/tokens/base.css, src/base/elements.css и src/blocks/<блок>/style.css */`,
  readFileSync(join(SRC, "tokens", "base.css"), "utf8"),
  readFileSync(join(SRC, "base", "elements.css"), "utf8"),
  ...blockDirs
    .filter((d) => existsSync(join(SRC, "blocks", d, "style.css")))
    .map((d) => `/* --- блок: ${d} --- */\n` + readFileSync(join(SRC, "blocks", d, "style.css"), "utf8")),
]
put(join(ASSETS, "base.css"), cssParts.join("\n\n"))

const jsParts = blockDirs
  .filter((d) => existsSync(join(SRC, "blocks", d, "script.js")))
  .map((d) => `/* --- блок: ${d} --- */\n` + readFileSync(join(SRC, "blocks", d, "script.js"), "utf8"))
// Каждый блок — IIFE. Склейка через \n превращает `})()` + `(function(){` в ВЫЗОВ
// предыдущего результата (ASI не спасает). Разделитель — точка с запятой.
put(join(ASSETS, "lab.js"), `/* СГЕНЕРИРОВАНО node build.mjs */\n` + jsParts.join("\n;\n"))

/* ---------- 3. шаблоны ---------- */
/** «Мёд таёжный|мёд|990|500 г|old=1290 badge=sale:−23% stock=low noimg» → объект. */
function expandProduct(line, i) {
  const [name, category, price, unit, flags = ""] = String(line).split("|")
  const f = Object.fromEntries(
    flags.trim().split(/\s+/).filter(Boolean).map((t) => {
      const j = t.indexOf("=")
      return j < 0 ? [t, true] : [t.slice(0, j), t.slice(j + 1)]
    })
  )
  const badge = f.badge ? { tone: String(f.badge).split(":")[0], label: String(f.badge).split(":").slice(1).join(":") } : null
  return {
    id: `p${i + 1}`,
    name: name.trim(),
    category: (category || "").trim(),
    price: Number(price),
    oldPrice: f.old ? Number(f.old) : null,
    unit: (unit || "").trim(),
    badge,
    image: f.noimg ? null : "art",
    stock: f.stock || "in",
    short: f.short || "",
    sku: f.sku || `ART-${2100 + i}`,
    moq: f.moq ? Number(f.moq) : null,
    alt: `${name.trim()} — ${(category || "товар").trim()}`,
  }
}

const argv = process.argv.slice(2).filter((a) => !a.startsWith("-"))
const files = readdirSync(join(SRC, "templates")).filter((f) => f.endsWith(".json")).sort()
const templates = files
  .map((f) => JSON.parse(readFileSync(join(SRC, "templates", f), "utf8")))
  .filter((t) => !argv.length || argv.includes(t.id))

const index = []
for (const tpl of templates) {
  tpl.products = tpl.products.map(expandProduct)
  const media = new Map()   // относительный путь → содержимое SVG
  const tones = tpl.art

  const reg = (name, svg) => {
    const path = `media/${tpl.id}/${name}.svg`
    media.set(path, svg)
    return `../../assets/${path}`
  }
  const kindOf = (p) => KIND_BY_CATEGORY[(p.category || "").toLowerCase()] || tpl.media.kind || "box"
  const artFor = (p, seed) =>
    tpl.media.fit === "cover"
      ? scene({ seed, kind: kindOf(p), tones, w: 400, h: 500 })
      : packshot({ seed, kind: kindOf(p), tones })

  let page = "index"
  const ctx = {
    tpl,
    data: { categories: tpl.categories, products: tpl.products },
    url: (p) => `${PAGES.includes(p) ? p : "index"}.html`,
    pick(source, limit) {
      const all = tpl.products
      const pool = source === "new" ? [...all].reverse() : source === "sale" ? all.filter((p) => p.oldPrice) : all
      return pool.slice(0, limit || pool.length)
    },
    img: (p) => reg(`p-${p.id}`, artFor(p, `${tpl.id}-${p.name}`)),
    tileImg: (c) => reg(`t-${c.id}`, tileArt({ seed: `${tpl.id}-${c.name}`, tones, w: 600, h: 400 })),
    heroImg: (b) => reg(`hero-${b.art || "1"}`, heroArt({ seed: `${tpl.id}-hero-${b.art || 1}`, tones })),
    storyImg: (b) => reg(`story-${b.art || "1"}`, tileArt({ seed: `${tpl.id}-story-${b.art || 1}`, tones, w: 600, h: 400 })),
    lookImg: (l, i) => reg(`look-${i}`, heroArt({ seed: `${tpl.id}-look-${i}-${l.title}`, tones, w: 1600, h: 900 })),
    galleryImg: (s, i) => {
      const p = tpl.products.find((x) => x.id === s.of) || tpl.products[0]
      return reg(`g-${p.id}-${i}`, artFor(p, `${tpl.id}-${p.name}-кадр-${i}`))
    },
  }

  /* --- CSS шаблона: ТОЛЬКО разрешённые переопределения (QR-TOKEN-COVERAGE) --- */
  const fontStack = (n) => `"${n}", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
  const overrides = {
    "--font-display": fontStack(tpl.fonts.display),
    "--font-body": fontStack(tpl.fonts.body),
    ...(tpl.fonts.mono ? { "--font-mono": `"${tpl.fonts.mono}", ui-monospace, Menlo, monospace` } : {}),
    "--grid-cols": String(tpl.gridCols),
    "--aspect-card": tpl.media.card,
    "--aspect-tile": tpl.media.tile,
    "--aspect-hero": tpl.media.hero,
    "--aspect-gallery": tpl.media.gallery,
    "--aspect-thumb": tpl.media.gallery,
    "--media-fit": tpl.media.fit,
    ...tpl.tokens,
  }
  put(
    join(ASSETS, `t-${tpl.id}.css`),
    `/* СГЕНЕРИРОВАНО node build.mjs из src/templates/${tpl.id}.json — шаблон «${tpl.name}» */\n` +
      `:root {\n${Object.entries(overrides).map(([k, v]) => `  ${k}: ${v};`).join("\n")}\n}\n`
  )

  /* --- страницы --- */
  const titles = {
    index: tpl.brand.name,
    catalog: `${tpl.catalogTitle} — ${tpl.brand.name}`,
    product: `${tpl.productTitle} — ${tpl.brand.name}`,
  }
  for (const p of PAGES) {
    page = p
    ctx.page = p
    const body = (tpl.pages[p] || [])
      .map((b) => {
        const fn = blocks[b.type]
        if (!fn) throw new Error(`${tpl.id}/${p}: неизвестный блок «${b.type}»`)
        return fn(b, ctx)
      })
      .join("\n")
    put(
      join(DIST, tpl.id, `${p}.html`),
      `<!doctype html>
<html lang="ru" data-template="${esc(tpl.id)}" data-density="${esc(tpl.density)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titles[p])}</title>
<meta name="description" content="${esc(tpl.brand.tagline)}">
<link rel="stylesheet" href="../../assets/fonts.css">
<link rel="stylesheet" href="../../assets/base.css">
<link rel="stylesheet" href="../../assets/t-${esc(tpl.id)}.css">
</head>
<body>
${body}
<script src="../../assets/lab.js" defer></script>
</body>
</html>
`
    )
  }

  /* --- картинки шаблона: сначала чистим каталог, чтобы сборка была воспроизводимой --- */
  const mediaDir = join(ASSETS, "media", tpl.id)
  const want = new Set([...media.keys()].map((k) => k.split("/").pop()))
  if (existsSync(mediaDir)) {
    for (const f of readdirSync(mediaDir)) if (!want.has(f)) { rmSync(join(mediaDir, f)); touched += 1 }
  }
  for (const [rel, svg] of media) put(join(ASSETS, rel), svg)

  index.push({
    id: tpl.id, name: tpl.name, subtitle: tpl.subtitle, audience: tpl.audience,
    fonts: tpl.fonts, density: tpl.density, gridCols: tpl.gridCols, media: tpl.media,
    tokens: Object.keys(overrides), products: tpl.products.length, art: tpl.art,
  })
}

put(join(DIST, "index.json"), JSON.stringify({ builtFrom: "build.mjs", templates: index }, null, 1))
console.log(`шаблонов ${templates.length} · блоков ${Object.keys(blocks).length} · изменено файлов ${touched}`)
