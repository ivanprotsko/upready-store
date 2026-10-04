import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const REPO = join(__dirname, "../../../../..")

const readJson = (p: string) => JSON.parse(readFileSync(join(REPO, p), "utf8"))

const SPEC = "specs/design-system/themes/supplements.theme.json"
const PROFILE = "apps/backend/src/migration-scripts/data/profiles/supplements/theme.json"

/**
 * The shop's brand hues. Everything else in the preset is its neutral ramp: page, cards, inks,
 * borders, the field surface, hovers and the grey chart steps.
 */
const BRAND = new Set(["--primary", "--ring", "--link", "--success", "--warning", "--destructive", "--chart-1"])

const isGrey = (hex: string) => {
  const n = parseInt(hex.slice(1, 7), 16)
  return (n >> 16) === ((n >> 8) & 255) && ((n >> 8) & 255) === (n & 255)
}

/**
 * Ivan, 04.10 (ask-20261004-090510-c687), on cherkashino's checkout form, which renders this
 * preset: «нужно привести поля к стилю medusjs ui и убрать этот зеленый оттенок в полях и везде
 * где он используется». The mint tint lived in the preset's neutral ramp (--secondary #eef5f2
 * under every field, --accent #e2eee9 on every hover, --border #d7e3de, a #0a1310 dark page), so
 * the ramp is grey now and only the brand hues keep a colour.
 */
describe("the supplements preset", () => {
  it.each(["light", "dark"] as const)("carries no hue outside its brand tokens in %s mode", (mode) => {
    const tokens: Record<string, string> = readJson(SPEC).modes[mode].tokens
    const tinted = Object.entries(tokens).filter(([key, value]) => {
      if (BRAND.has(key)) return false
      const hexes = value.match(/#[0-9a-f]{6}/gi) ?? []
      return hexes.some((hex) => !isGrey(hex))
    })
    expect(tinted).toEqual([])
  })

  it("keeps its brand emerald and mint", () => {
    const { light, dark } = readJson(SPEC).modes
    expect(light.tokens["--primary"]).toBe("#0a6a52")
    expect(dark.tokens["--primary"]).toBe("#57e0b0")
  })

  it("is the same in the spec and in the backend store profile", () => {
    expect(readJson(PROFILE).modes).toEqual(readJson(SPEC).modes)
  })
})
