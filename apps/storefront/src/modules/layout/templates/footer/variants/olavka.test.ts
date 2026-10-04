import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Ivan, 04.10.2026: «когда три колонки, то крайняя левая должна быть занята. Т.е. все
 * колонки сдвинуть влево, чтобы третья колонка не переносилась». The Olavka footer sits
 * on `PRODUCT_GRID_CLASS` and leaves column 1 empty only when that grid has four
 * columns (remark 15). The skip switched on at 961px while the grid turned four
 * columns at `large` (1440), so from 961 to 1439 Категории stood in column 2 and «©»
 * wrapped onto a second row.
 *
 * `FooterOlavka` is an async Server Component this package has no renderer for, so the
 * breakpoints are asserted on the source, the same convention `(main)/layout.test.ts`
 * uses: the skip has to carry exactly the prefix the grid turns four columns at.
 */
const here = dirname(fileURLToPath(import.meta.url))
const footer = readFileSync(join(here, "olavka.tsx"), "utf8")
const productCard = readFileSync(
  join(here, "../../../../products/components/product-card/index.tsx"),
  "utf8"
)

const gridClass = productCard.match(/export const PRODUCT_GRID_CLASS =\s*"([^"]+)"/)?.[1]
const skipClass = footer.match(/const SKIP_FIRST_COLUMN = "([^"]+)"/)?.[1]

describe("Olavka footer: the first column is skipped only on a four-column grid", () => {
  it("reads both class strings from the source", () => {
    expect(gridClass).toBeTruthy()
    expect(skipClass).toBeTruthy()
  })

  it("switches the skip on at the breakpoint the grid turns four columns", () => {
    const fourColumnsAt = gridClass?.match(/(\S+:)grid-cols-4\b/)?.[1]
    const skipAt = skipClass?.match(/^(\S+?:)\[/)?.[1]
    expect(fourColumnsAt).toBeTruthy()
    expect(skipAt).toBe(fourColumnsAt)
  })

  it("never skips a column on the three-column grid", () => {
    const threeColumnsAt = gridClass?.match(/(\S+:)grid-cols-3\b/)?.[1]
    expect(threeColumnsAt).toBeTruthy()
    expect(skipClass?.startsWith(threeColumnsAt ?? "")).toBe(false)
  })

  it("puts the grid and the skip on the same element", () => {
    expect(footer).toContain("${PRODUCT_GRID_CLASS} ${SKIP_FIRST_COLUMN}")
  })
})
