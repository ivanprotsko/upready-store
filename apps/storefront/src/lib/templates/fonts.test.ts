import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { brotliDecompressSync } from "node:zlib"
import { describe, expect, it } from "vitest"

import { FONT_NAMES, FONT_VARIABLES } from "@lib/theme/fonts"

import { TEMPLATE_FONTS_STYLESHEET, TEMPLATE_FONT_FAMILIES, templateFontPair } from "./fonts"

/**
 * The template fonts (t-2026-10-12-33 T0a): every family `TEMPLATE_FONT_FAMILIES` names has its
 * Latin and Cyrillic file, under the SIL OFL the file itself states, declared and paired by the
 * stylesheet, and nothing in that stylesheet acts on a page without `data-font-pair`.
 */

const PUBLIC = join(__dirname, "../../../public")
const DIR = join(PUBLIC, "fonts/templates")
const sheet = readFileSync(join(PUBLIC, TEMPLATE_FONTS_STYLESHEET), "utf8")
const uncommented = sheet.replace(/\/\*[\s\S]*?\*\//g, "")
const faces = Array.from(uncommented.matchAll(/@font-face\s*\{([^}]*)\}/g)).map((m) => {
  const prop = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(m[1])?.[1]?.trim() ?? ""
  return {
    family: prop("font-family").replace(/"/g, ""),
    display: prop("font-display"),
    file: /url\("\.\/([^"]+)"\)/.exec(m[1])?.[1] ?? "",
    range: prop("unicode-range"),
  }
})
const rules = Array.from(uncommented.replace(/@font-face\s*\{[^}]*\}/g, "").matchAll(/([^{}]+)\{([^}]*)\}/g)).map((m) => ({
  selector: m[1].trim(),
  body: m[2],
}))
const woff2 = readdirSync(DIR).filter((f) => f.endsWith(".woff2"))

/** Name ID 14 (licence URL) of a woff2: the table directory, then one Brotli stream holding every table. */
function licenceUrl(path: string): string | null {
  const TAGS = ["cmap", "head", "hhea", "hmtx", "maxp", "name"]
  const buf = readFileSync(path)
  const pos = { p: 48 }
  const base128 = () => {
    let v = 0
    for (let i = 0; i < 5; i++) {
      const b = buf[pos.p++]
      v = (v << 7) | (b & 0x7f)
      if (!(b & 0x80)) return v >>> 0
    }
    throw new Error(`${path}: bad UIntBase128`)
  }
  const tables: { tag: string; length: number }[] = []
  for (let i = 0; i < buf.readUInt16BE(12); i++) {
    const flags = buf[pos.p++]
    const index = flags & 0x3f
    const tag = index === 63 ? buf.toString("latin1", pos.p, (pos.p += 4)) : (TAGS[index] ?? `#${index}`)
    const version = flags >> 6
    const original = base128()
    // glyf and loca (indices 10, 11) are transformed unless version 3; every other table only when not 0
    const transformed = index === 10 || index === 11 ? version !== 3 : version !== 0
    tables.push({ tag, length: transformed ? base128() : original })
  }
  const data = brotliDecompressSync(buf.subarray(pos.p, pos.p + buf.readUInt32BE(20)))
  let offset = 0
  for (const t of tables) {
    if (t.tag === "name") {
      const name = data.subarray(offset, offset + t.length)
      const strings = name.readUInt16BE(4)
      for (let i = 0; i < name.readUInt16BE(2); i++) {
        const r = 6 + i * 12
        if (name.readUInt16BE(r + 6) !== 14 || name.readUInt16BE(r) !== 3) continue
        const raw = name.subarray(strings + name.readUInt16BE(r + 10), strings + name.readUInt16BE(r + 10) + name.readUInt16BE(r + 8))
        return String.fromCharCode(...Array.from({ length: raw.length / 2 }, (_, k) => raw.readUInt16BE(k * 2)))
      }
      return null
    }
    offset += t.length
  }
  return null
}

describe("the template font files", () => {
  it("are families of FONT_NAMES only", () => {
    for (const family of TEMPLATE_FONT_FAMILIES) expect(FONT_NAMES as readonly string[]).toContain(family)
  })

  it.each([...TEMPLATE_FONT_FAMILIES])("%s has a Latin and a Cyrillic face, swapped in", (family) => {
    const own = faces.filter((f) => f.family === family)
    expect(own.some((f) => f.range.startsWith("U+0000-00FF")), "latin").toBe(true)
    expect(own.some((f) => f.range.includes("U+0400-045F")), "cyrillic").toBe(true)
    for (const face of own) expect(face.display).toBe("swap")
  })

  it("declares exactly the files in the folder, and only the listed families", () => {
    expect(faces.map((f) => f.file).sort()).toEqual([...woff2].sort())
    expect(new Set(faces.map((f) => f.family))).toEqual(new Set(TEMPLATE_FONT_FAMILIES))
  })

  it.each(woff2)("%s states the SIL Open Font License", (file) => {
    expect(licenceUrl(join(DIR, file))).toMatch(/^https?:\/\/(openfontlicense\.org|scripts\.sil\.org\/OFL)$/)
  })

  it("lists every family in LICENSES.md", () => {
    const licences = readFileSync(join(DIR, "LICENSES.md"), "utf8")
    for (const family of TEMPLATE_FONT_FAMILIES) expect(licences).toContain(`| ${family} |`)
  })
})

describe("the template font stylesheet", () => {
  it.each([...TEMPLATE_FONT_FAMILIES])("pairs %s as display and as body", (family) => {
    const display = rules.find((r) => r.selector === `[data-font-pair^="${family}|"]`)
    const body = rules.find((r) => r.selector === `[data-font-pair$="|${family}"]`)
    expect(display?.body).toContain(`${FONT_VARIABLES.display}: "${family}",`)
    expect(body?.body).toContain(`${FONT_VARIABLES.body}: "${family}",`)
  })

  it("acts only under data-font-pair", () => {
    expect(rules.length).toBeGreaterThan(0)
    for (const rule of rules) {
      for (const selector of rule.selector.split(/,(?![^(]*\))/)) expect(selector.trim()).toMatch(/^\[data-font-pair/)
    }
  })

  it("puts the page text in the body variable and the headings in the display one", () => {
    const text = rules.find((r) => r.body.includes(`font-family: var(${FONT_VARIABLES.body})`))
    const headings = rules.find((r) => r.body.includes(`font-family: var(${FONT_VARIABLES.display})`))
    expect(text?.selector).toContain('[class^="txt-"]')
    expect(headings?.selector).toMatch(/:is\(h1, h2, h3, \.h1-core/)
    // equal weight (0,2,0), so the heading rule wins by coming last
    expect(rules.indexOf(headings!)).toBeGreaterThan(rules.indexOf(text!))
  })

  it("names a pair only when both families have files", () => {
    expect(templateFontPair({ display: "Cormorant Garamond", body: "Inter" })).toBe("Cormorant Garamond|Inter")
    expect(templateFontPair({ display: "Fraunces", body: "Manrope" })).toBeNull()
    expect(templateFontPair({ display: "Manrope", body: "Sora" })).toBeNull()
  })
})
