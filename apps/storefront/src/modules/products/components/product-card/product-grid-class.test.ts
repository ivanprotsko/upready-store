import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))

// Read as source rather than `import`: this module pulls in `@i18n/navigation`
// (next-intl's wrapped `Link`), which fails to resolve under vitest's node
// environment (a next-intl/next ESM interop issue unrelated to this task) —
// the same reason no other component under `modules/products` is imported
// live in a test here.
const cardSource = readFileSync(join(here, "index.tsx"), "utf8")
const tailwindConfigSource = readFileSync(
  join(here, "../../../../../tailwind.config.js"),
  "utf8"
)

const gridClassMatch = cardSource.match(/PRODUCT_GRID_CLASS =\s*\n?\s*"([^"]+)"/)
const PRODUCT_GRID_CLASS = gridClassMatch?.[1] ?? ""

/**
 * t-2026-09-25-18 (1.1, Ivan verbatim: «три карточки товаров в одном ряду
 * должны появляться только на ширине 960»): three columns used to start at
 * `small` (1024px, tailwind.config.js). `grid-3` is the dedicated 960px
 * token added there for this grid; below it the layout stays at two columns,
 * the same as before.
 */
describe("PRODUCT_GRID_CLASS", () => {
  it("is found in the source", () => {
    expect(PRODUCT_GRID_CLASS).not.toBe("")
  })

  it("switches to three columns at the dedicated 960px token, not at small (1024px)", () => {
    expect(PRODUCT_GRID_CLASS).toContain("grid-3:grid-cols-3")
    expect(PRODUCT_GRID_CLASS).not.toContain("small:grid-cols-3")
  })

  it("keeps two columns below 960 and four columns from large (1440px)", () => {
    expect(PRODUCT_GRID_CLASS).toContain("grid-cols-2")
    expect(PRODUCT_GRID_CLASS).toContain("large:grid-cols-4")
  })

  it("the grid-3 token is defined at exactly 960px in the theme", () => {
    expect(tailwindConfigSource).toMatch(/"grid-3":\s*"960px"/)
  })
})
