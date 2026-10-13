import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it, vi } from "vitest"

import { FOOTER_KEYS, HEADER_KEYS, HERO_KEYS, LISTING_KEYS } from "@lib/theme/composition"
import CategoryTiles from "@modules/home/components/category-tiles"
import { HERO_VARIANTS, LISTING_VARIANTS } from "@modules/home/variants"
import { FOOTER_VARIANTS } from "@modules/layout/templates/footer/variants"
import { NAV_VARIANTS } from "@modules/layout/templates/nav/variants"

import { EXISTING_BLOCKS } from "./existing"
import { BLOCKS, CATEGORY_BLOCKS, blockById } from "./registry"
import { BLOCK_CATEGORIES, BLOCK_ROLES } from "./types"

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
      // A further fixture gets its own playground anchor, `block-<category>-<variant>-<name>`.
      for (const [name, fixture] of Object.entries(block.fixtures!)) {
        expect(name, `${block.id} fixture name`).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        expect(name, `${block.id} fixture name`).not.toBe("live")
        expect(block.parseProps!(fixture).ok, `${block.id} ${name}`).toBe(true)
      }
    }
  })

  it("gives every declared category its own file, holding only blocks of that category", () => {
    const registry = readFileSync(fileURLToPath(new URL("./registry.ts", import.meta.url)), "utf8")
    for (const category of BLOCK_CATEGORIES) {
      expect(existsSync(fileURLToPath(new URL(`./${category}/index.ts`, import.meta.url))), category).toBe(true)
      expect(registry, category).toContain(`import * as ${category} from "./${category}"`)
      for (const block of CATEGORY_BLOCKS[category]) {
        expect(block.category, block.id).toBe(category)
        expect(block.id).toBe(`${category}/${block.variant}`)
        expect(block.variant, block.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      }
    }
  })

  it("is the composition variants first, then each category's file in declared order, sorted by variant", () => {
    const expected = [
      ...EXISTING_BLOCKS,
      ...BLOCK_CATEGORIES.flatMap((category) =>
        [...CATEGORY_BLOCKS[category]].sort((a, b) => (a.variant < b.variant ? -1 : 1))
      ),
    ]
    expect(BLOCKS.map((b) => b.id)).toEqual(expected.map((b) => b.id))
    const announcement = CATEGORY_BLOCKS.announcement.map((b) => b.id)
    expect(announcement).toEqual(expect.arrayContaining(["announcement/rotator", "announcement/text-bar"]))
    expect(announcement.indexOf("announcement/rotator")).toBeLessThan(announcement.indexOf("announcement/text-bar"))
  })

  it("describes every block with known roles", () => {
    const known = new Set<string>(BLOCK_ROLES)
    for (const block of BLOCKS) {
      expect(block.roles.filter((role) => !known.has(role)), block.id).toEqual([])
    }
  })
})
