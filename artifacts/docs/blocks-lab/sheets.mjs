#!/usr/bin/env node
/**
 * Contact sheets of the blocks lab: one montage per variant, the five brands stacked, so a
 * corridor point is judged across every palette at once (t-2026-09-08-01, 2026-09-09).
 *
 *   node artifacts/docs/blocks-lab/shoot.mjs         # first: shot-<brand>-<variant>.png
 *   node artifacts/docs/blocks-lab/sheets.mjs        # -> sheets/<variant>.webp, sheets/<family>-overview.webp
 *
 * Same discipline as hero-lab-2/collection.mjs: binaries stay out of git, a missing shot fails
 * the run by name.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, "sheets")
const FONT = "/System/Library/Fonts/Helvetica.ttc"
const BRANDS = [
  { id: "sneakers", name: "Kerbstone" },
  { id: "electronics", name: "Ferrite" },
  { id: "supplements", name: "Scruple" },
  { id: "womens-fashion", name: "Larchant" },
  { id: "home-goods", name: "Long Morning" },
]
const FAMILIES = {
  listing: ["p1", "p2", "p3", "p4", "p5"],
  header: ["h1", "h2", "h3", "h4", "h5"],
  footer: ["f1", "f2", "f3", "f4", "f5"],
  gallery: ["ga", "ga-2", "gb", "gb-2"],
}
const NAMES = {
  p1: "P1 · Сетка 4", p2: "P2 · Плотная 6", p3: "P3 · Список", p4: "P4 · Стена", p5: "P5 · Редакционная",
  h1: "H1 · Как сейчас", h2: "H2 · Слева, меню в строку", h3: "H3 · Два яруса", h4: "H4 · Акцентная", h5: "H5 · Тонкая + полоса",
  f1: "F1 · Четыре колонки", f2: "F2 · Одна строка", f3: "F3 · Гигантский wordmark", f4: "F4 · Инверсия с рассылкой", f5: "F5 · Условия плитками",
  ga: "GA · Карусель с соседями", "ga-2": "GA · после «вперёд»", gb: "GB · Полосы", "gb-2": "GB · после клика по третьей полосе",
}

const shot = (brand, key) => {
  const file = join(HERE, `shot-${brand}-${key}.png`)
  if (!existsSync(file)) throw new Error(`missing shot: ${file} — run shoot.mjs first`)
  return file
}
const magick = (args) => execFileSync("magick", args, { stdio: ["ignore", "pipe", "inherit"] })
const kb = (file) => `${Math.round(statSync(file).size / 1024)} KB`
const framed = (file, label, width, bar = 44, size = 22) => [
  "(", file, "-resize", `${width}x`, "-gravity", "northwest", "-background", "#141414", "-splice", `0x${bar}`,
  "-font", FONT, "-pointsize", String(size), "-fill", "#ffffff", "-annotate", `+16+${Math.round((bar - size) / 2) + 1}`, label, ")",
]

mkdirSync(OUT, { recursive: true })
const made = []
for (const [family, keys] of Object.entries(FAMILIES)) {
  for (const key of keys) {
    const out = join(OUT, `${key}.webp`)
    const args = ["-background", "#8a8a8a"]
    for (const b of BRANDS) args.push(...framed(shot(b.id, key), `${NAMES[key]}   —   ${b.name} (${b.id})`, 1400))
    args.push("-append", "-quality", "82", "-define", "webp:method=6", out)
    magick(args)
    made.push({ file: out, what: `${NAMES[key]} × 5 брендов` })
  }
  // the family at a glance: rows = variants, columns = brands, top 480 px of every shot
  const rows = []
  for (const key of keys) {
    const row = ["(", "-background", "#8a8a8a"]
    for (const b of BRANDS) {
      row.push("(", shot(b.id, key), "-resize", "560x", "-gravity", "north", "-crop", "560x480+0+0", "+repage",
        "-background", "#141414", "-splice", "0x34", "-font", FONT, "-pointsize", "18", "-fill", "#ffffff",
        "-gravity", "northwest", "-annotate", "+12+9", `${key.toUpperCase()} · ${b.name}`, ")")
    }
    row.push("+append", ")")
    rows.push(...row)
  }
  const out = join(OUT, `${family}-overview.webp`)
  magick(["-background", "#8a8a8a", ...rows, "-append", "-quality", "80", "-define", "webp:method=6", out])
  made.push({ file: out, what: `${family}: ${keys.length} вариантов × 5 брендов, верхние 480 px` })
}
for (const m of made) {
  const dims = execFileSync("magick", ["identify", "-format", "%wx%h", m.file], { encoding: "utf8" })
  console.log(`${m.file.replace(HERE + "/", "")}  ${dims}  ${kb(m.file)}  — ${m.what}`)
}
