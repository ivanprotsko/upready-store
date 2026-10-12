import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { BLOCK_ROLES } from "./types"

/**
 * R1's role list (t-2026-10-12-33, `artifacts/research/2026-10-13-templates-shopify/roles.json`):
 * the analyser's words and the extensions the Shopify sections needed. Every one is a `BlockRole`,
 * so no block PR has to edit `types.ts` to describe what it draws.
 */
const ROLES_JSON = fileURLToPath(
  new URL("../../../../../artifacts/research/2026-10-13-templates-shopify/roles.json", import.meta.url)
)

describe("BLOCK_ROLES", () => {
  const catalogue = JSON.parse(readFileSync(ROLES_JSON, "utf8")) as { role: string; from: string }[]

  it("holds every role of R1's roles.json", () => {
    expect(catalogue.filter((r) => r.from === "analyser")).toHaveLength(46)
    expect(catalogue.filter((r) => r.from === "extension")).toHaveLength(10)
    const known = new Set<string>(BLOCK_ROLES)
    expect(catalogue.map((r) => r.role).filter((role) => !known.has(role))).toEqual([])
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
