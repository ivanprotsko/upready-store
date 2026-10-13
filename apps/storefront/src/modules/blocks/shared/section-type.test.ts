import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { SECTION_TYPE } from "./section-type"

// The storefront's declared type scale, as `pnpm template:check` resolves it (scripts/template-check.mjs).
const require = createRequire(import.meta.url)
const resolveConfig = require("tailwindcss/resolveConfig")
const theme = resolveConfig(require(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../tailwind.config.js"))).theme
const px = (token: string) => {
  const value = theme.fontSize[token]
  const size = Array.isArray(value) ? value[0] : value
  return size.endsWith("rem") ? parseFloat(size) * 16 : parseFloat(size)
}

// The size of a role below `small` (360) and from `small` (1280): its `text-<size>` and `small:text-<size>`.
const SIZE = /^text-(xs|sm|base|lg|xl|[2-9]xl)$/
const sizeOf = (classes: string) => {
  const tokens = classes.split(/\s+/)
  const base = tokens.find((t) => SIZE.test(t))?.slice(5)
  const wide = tokens.find((t) => t.startsWith("small:") && SIZE.test(t.slice(6)))?.slice(11) ?? base
  return { narrow: px(base!), wide: px(wide!) }
}

describe("SECTION_TYPE", () => {
  it("sets the four roles in rich-text's numbers: 12 / 24→32 / 16→18 px, the see-all link 16→14 px", () => {
    expect(sizeOf(SECTION_TYPE.label)).toEqual({ narrow: 12, wide: 12 })
    expect(sizeOf(SECTION_TYPE.heading)).toEqual({ narrow: 24, wide: 32 })
    expect(sizeOf(SECTION_TYPE.description)).toEqual({ narrow: 16, wide: 18 })
    expect(sizeOf(SECTION_TYPE.seeAll)).toEqual({ narrow: 16, wide: 14 })
  })

  it("keeps capitals small and tracked, the heading balanced and tight, the description subtle", () => {
    expect(SECTION_TYPE.label.split(" ")).toEqual(expect.arrayContaining(["uppercase", "tracking-widest", "font-medium", "text-ui-fg-muted"]))
    expect(SECTION_TYPE.heading.split(" ")).toEqual(expect.arrayContaining(["text-balance", "leading-tight", "font-semibold"]))
    expect(SECTION_TYPE.description.split(" ")).toEqual(expect.arrayContaining(["text-pretty", "text-ui-fg-subtle"]))
  })

  it("passes the lab's type rules at 360 and 1280: neighbours ≥ 1.15×, heading ÷ description ≥ 1.5", () => {
    for (const width of ["narrow", "wide"] as const) {
      const sizes = Array.from(new Set(Object.values(SECTION_TYPE).map((classes) => sizeOf(classes)[width]))).sort((a, b) => a - b)
      for (let i = 1; i < sizes.length; i += 1) {
        expect(sizes[i] / sizes[i - 1], `${width}: ${sizes[i - 1]}→${sizes[i]}`).toBeGreaterThanOrEqual(1.15)
      }
      expect(sizeOf(SECTION_TYPE.heading)[width] / sizeOf(SECTION_TYPE.description)[width]).toBeGreaterThanOrEqual(1.5)
    }
  })
})
