import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { BLOCK_ROLES } from "./types"

/**
 * The catalogues' role lists (t-2026-10-12-33): R1's for Shopify, R2's for InSales and Tilda,
 * the analyser's words and the extensions their sections needed. Every one is a `BlockRole`,
 * so no block PR has to edit `types.ts` to describe what it draws.
 */
const catalogue = (folder: string) =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../../../../../artifacts/research/${folder}/roles.json`, import.meta.url)), "utf8")
  ) as { role: string; from: string }[]

describe("BLOCK_ROLES", () => {
  const known = new Set<string>(BLOCK_ROLES)

  it.each([
    ["R1's", "2026-10-13-templates-shopify", 46, 10],
    ["R2's", "2026-10-13-templates-insales-tilda", 44, 19],
  ])("holds every role of %s roles.json", (_, folder, analyser, extension) => {
    const roles = catalogue(folder)
    expect(roles.filter((r) => r.from === "analyser")).toHaveLength(analyser)
    expect(roles.filter((r) => r.from === "extension")).toHaveLength(extension)
    expect(roles.map((r) => r.role).filter((role) => !known.has(role))).toEqual([])
  })

  it("holds the mark of the same shop on a marketplace, from R2's build list", () => {
    expect(BLOCK_ROLES).toContain("marketplace-badge")
  })

  it("keeps the roles the registry used before", () => {
    for (const role of ["brand", "navigation", "search", "cart", "category-links", "body-text", "promo-text", "newsletter", "legal", "contacts"]) {
      expect(BLOCK_ROLES).toContain(role)
    }
  })

  it("is sorted, one of each", () => {
    expect([...BLOCK_ROLES]).toEqual(Array.from(new Set(BLOCK_ROLES)).sort())
  })
})
