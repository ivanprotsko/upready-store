#!/usr/bin/env node
/**
 * Заводит шрифты в лабораторию ОДИН раз: скачивает woff2 с Google Fonts и пишет
 * assets/fonts/*.woff2 + assets/fonts.css с локальными путями.
 *
 * Почему локально, а не <link> на fonts.googleapis.com:
 *   1) шаблон, открытый без сети, обязан выглядеть так же — иначе Иван судит системный фолбэк;
 *   2) снимки shots.mjs должны быть воспроизводимы;
 *   3) правило 17d: чужой CDN в артефакте — это зависимость, которой у артефакта быть не должно.
 *
 * Берутся только подмножества latin и cyrillic: магазин русский, остальное — вес впустую.
 * Семейства — из белого списка витрины (apps/storefront/src/lib/theme/fonts.ts), и только те
 * восемь из двенадцати, у которых КИРИЛЛИЦА ЕСТЬ (замер 2026-09-16, см. report.md).
 *
 *   node fonts.mjs          # скачать недостающее
 *   node fonts.mjs --force  # перекачать всё
 */
import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, "assets", "fonts")
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
const KEEP = new Set(["latin", "cyrillic"])
const force = process.argv.includes("--force")

/** Семейство → веса. Только кириллические семейства белого списка витрины. */
const FAMILIES = {
  Geist: [400, 500, 600],
  Inter: [400, 500, 600],
  Manrope: [400, 500, 600],
  Nunito: [400, 500, 600],
  "Playfair Display": [400, 500, 600],
  "Cormorant Garamond": [400, 500, 600],
  "IBM Plex Sans": [400, 500, 600],
  "IBM Plex Mono": [400, 500],
}

mkdirSync(OUT, { recursive: true })
const faces = []
let downloaded = 0, reused = 0

for (const [family, weights] of Object.entries(FAMILIES)) {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@${weights.join(";")}&display=swap`
  const css = await (await fetch(url, { headers: { "User-Agent": UA } })).text()
  if (!css.includes("@font-face")) throw new Error(`${family}: Google вернул не CSS — ${css.slice(0, 120)}`)

  // Комментарий перед каждым блоком называет подмножество: /* cyrillic */
  const blocks = css.split("/*").slice(1)
  for (const b of blocks) {
    const subset = b.slice(0, b.indexOf("*/")).trim()
    if (!KEEP.has(subset)) continue
    const weight = /font-weight:\s*(\d+)/.exec(b)?.[1]
    const src = /src:\s*url\((https:[^)]+\.woff2)\)/.exec(b)?.[1]
    const range = /unicode-range:\s*([^;]+);/.exec(b)?.[1]
    if (!weight || !src) continue
    const slug = family.toLowerCase().replace(/\s+/g, "-")
    const file = `${slug}-${weight}-${subset}.woff2`
    const path = join(OUT, file)
    if (force || !existsSync(path)) {
      const buf = Buffer.from(await (await fetch(src, { headers: { "User-Agent": UA } })).arrayBuffer())
      writeFileSync(path, buf)
      downloaded += 1
    } else reused += 1
    faces.push({ family, weight, file, range })
  }
}

const css = [
  "/* СГЕНЕРИРОВАНО node fonts.mjs — не править руками. */",
  ...faces.map((f) =>
    `@font-face{font-family:"${f.family}";font-style:normal;font-weight:${f.weight};font-display:swap;` +
    `src:url("fonts/${f.file}") format("woff2");${f.range ? `unicode-range:${f.range};` : ""}}`
  ),
].join("\n") + "\n"
writeFileSync(join(HERE, "assets", "fonts.css"), css)

const bytes = readdirSync(OUT).reduce((n, f) => n + statSync(join(OUT, f)).size, 0)
console.log(`семейств ${Object.keys(FAMILIES).length} · начертаний ${faces.length} · скачано ${downloaded}, взято с диска ${reused} · ${(bytes / 1024).toFixed(0)} КБ`)
