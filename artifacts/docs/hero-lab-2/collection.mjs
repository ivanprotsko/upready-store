#!/usr/bin/env node
/**
 * The permanent collection of the round-two hero variants: one montage per variant showing
 * it in the context of all five themes, one overview of the whole 6 × 5 matrix, and one
 * mobile strip (t-2026-09-08-01, 2026-09-09). Reference: artifacts/docs/hero-variants-collection.md.
 *
 *   node artifacts/docs/hero-lab-2/serve.mjs &        # the lab must be up
 *   node artifacts/docs/hero-lab-2/shoot.mjs           # -> shot-<brand>-<variant>.png (30)
 *   node artifacts/docs/hero-lab-2/shoot.mjs sneakers --mobile
 *   node artifacts/docs/hero-lab-2/collection.mjs      # -> collection/<variant>.webp, overview.webp,
 *                                                      #    mobile-sneakers.webp
 *
 * Binaries stay out of git (rule 21f): the shots and the montages are regenerated from the
 * lab, which in turn reads the real profiles; only this script and the document are tracked.
 * A missing shot fails the run by name rather than leaving a hole in a montage.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, "collection")
const FONT = "/System/Library/Fonts/Helvetica.ttc"

const BRANDS = [
  { id: "sneakers", name: "Kerbstone" },
  { id: "electronics", name: "Ferrite" },
  { id: "supplements", name: "Scruple" },
  { id: "womens-fashion", name: "Larchant" },
  { id: "home-goods", name: "Long Morning" },
]
const VARIANTS = [
  { key: "g", name: "G · Витрина" },
  { key: "h", name: "H · Полка" },
  { key: "j", name: "J · Три двери" },
  { key: "k", name: "K · Объявление" },
  { key: "l", name: "L · В движении" },
  { key: "m", name: "M · Без hero" },
]

const shot = (brand, key, mobile = false) => {
  const file = join(HERE, `shot-${brand}-${key}${mobile ? "-390" : ""}.png`)
  if (!existsSync(file)) throw new Error(`missing shot: ${file} — run shoot.mjs first`)
  return file
}
const magick = (args) => execFileSync("magick", args, { stdio: ["ignore", "pipe", "inherit"] })
const kb = (file) => `${Math.round(statSync(file).size / 1024)} KB`

/** One frame: the shot resized to `width`, a dark label bar spliced on top. */
const framed = (file, label, width, bar = 44, size = 22) => [
  "(",
  file,
  "-resize", `${width}x`,
  "-gravity", "northwest",
  "-background", "#141414",
  "-splice", `0x${bar}`,
  "-font", FONT, "-pointsize", String(size), "-fill", "#ffffff",
  "-annotate", `+16+${Math.round((bar - size) / 2) + 1}`, label,
  ")",
]

mkdirSync(OUT, { recursive: true })
const made = []

// one montage per variant: five brands stacked, so a variant is judged across every palette
for (const v of VARIANTS) {
  const out = join(OUT, `${v.key}.webp`)
  const args = ["-background", "#8a8a8a"]
  for (const b of BRANDS) args.push(...framed(shot(b.id, v.key), `${v.name}   —   ${b.name} (${b.id})`, 1400))
  args.push("-append", "-quality", "82", "-define", "webp:method=6", out)
  magick(args)
  made.push({ file: out, what: `${v.name} × 5 брендов` })
}

// the whole matrix at a glance: rows = variants, columns = brands, crops to a common height so
// the rows line up (the shots differ in height by variant)
{
  const cell = 560
  const rowH = 560
  const rows = []
  for (const v of VARIANTS) {
    const row = ["(", "-background", "#8a8a8a"]
    for (const b of BRANDS) {
      row.push(
        "(", shot(b.id, v.key), "-resize", `${cell}x`, "-gravity", "north", "-crop", `${cell}x${rowH}+0+0`, "+repage",
        "-background", "#141414", "-splice", "0x34",
        "-font", FONT, "-pointsize", "18", "-fill", "#ffffff", "-gravity", "northwest",
        "-annotate", "+12+9", `${v.key.toUpperCase()} · ${b.name}`,
        ")"
      )
    }
    row.push("+append", ")")
    rows.push(...row)
  }
  const out = join(OUT, "overview.webp")
  magick(["-background", "#8a8a8a", ...rows, "-append", "-quality", "80", "-define", "webp:method=6", out])
  made.push({ file: out, what: "матрица 6 вариантов × 5 брендов (верхние 560 px каждого кадра)" })
}

// mobile: the six variants side by side for the one brand that was shot at 390 px
{
  const out = join(OUT, "mobile-sneakers.webp")
  const args = ["-background", "#8a8a8a"]
  for (const v of VARIANTS) args.push(...framed(shot("sneakers", v.key, true), v.name, 390, 36, 17))
  args.push("+append", "-quality", "82", "-define", "webp:method=6", out)
  magick(args)
  made.push({ file: out, what: "Kerbstone на 390 px, шесть вариантов в ряд" })
}

for (const m of made) {
  const dims = execFileSync("magick", ["identify", "-format", "%wx%h", m.file], { encoding: "utf8" })
  console.log(`${m.file.replace(HERE + "/", "")}  ${dims}  ${kb(m.file)}  — ${m.what}`)
}
