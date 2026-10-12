import { describe, expect, it, vi } from "vitest"

import { FOOTER_KEYS, HEADER_KEYS, HERO_KEYS, LISTING_KEYS } from "@lib/theme/composition"
import CategoryTiles from "@modules/home/components/category-tiles"
import { HERO_VARIANTS, LISTING_VARIANTS } from "@modules/home/variants"
import { FOOTER_VARIANTS } from "@modules/layout/templates/footer/variants"
import { NAV_VARIANTS } from "@modules/layout/templates/nav/variants"

import { BLOCKS, blockById } from "./registry"

// The header and footer variants reach `server-only` loaders; outside the react-server
// condition that package throws on import, and nothing here renders. Hoisted by vitest.
vi.mock("server-only", () => ({}))

/**
 * The registry covers every variant key of the composition document, by reference
 * (t-2026-10-12-33): the entry of `hero/g` IS `HERO_VARIANTS.g`, not a copy of it, so the
 * template programme cannot drift from what a shop renders.
 */
describe("block registry", () => {
  const live: [string, Record<string, unknown>, readonly string[]][] = [
    ["header", NAV_VARIANTS, HEADER_KEYS],
    ["hero", HERO_VARIANTS, HERO_KEYS.filter((k) => k !== "none")],
    ["listing", LISTING_VARIANTS, LISTING_KEYS.filter((k) => k !== "none")],
    ["footer", FOOTER_VARIANTS, FOOTER_KEYS.filter((k) => k !== "none")],
  ]

  for (const [category, registry, keys] of live) {
    it.each(keys)(`${category}/%s is registered and is the live component`, (key) => {
      const entry = blockById(`${category}/${key}`)
      expect(entry).not.toBeNull()
      expect(entry!.component).toBe(registry[key])
      expect(entry!.setting).toEqual({ field: category, value: key })
      expect(entry!.labelKey).toBe(`Composition.${category}.${key}`)
    })
  }

  it("tiles/on is the category tiles of the home page", () => {
    expect(blockById("tiles/on")?.component).toBe(CategoryTiles)
  })

  it("has no block twice and every id is <category>/<variant>", () => {
    const ids = BLOCKS.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const block of BLOCKS) expect(block.id).toBe(`${block.category}/${block.variant}`)
  })

  it("puts header and footer on every page and the rest on the home page", () => {
    for (const block of BLOCKS) {
      expect(block.placement).toBe(["header", "footer"].includes(block.category) ? "site" : "home")
    }
  })

  it("gives every block written for templates a props parser and both fixtures, which it accepts", () => {
    const lab = BLOCKS.filter((b) => !b.setting)
    expect(lab.map((b) => b.id)).toContain("announcement/text-bar")
    for (const block of lab) {
      expect(block.parseProps, block.id).toBeTypeOf("function")
      expect(block.fixtures, block.id).toBeDefined()
      expect(block.parseProps!(block.fixtures!.empty).ok, `${block.id} empty`).toBe(true)
      expect(block.parseProps!(block.fixtures!.sample).ok, `${block.id} sample`).toBe(true)
    }
  })
})
