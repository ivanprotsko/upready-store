import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-09-25-18 (2.2, Ivan verbatim: «ширину правого блока нужно сделать
 * такой же как на остальный страницах»): the course page's buy box used to
 * sit in a column pinned to a fixed `24rem`, while every other product page
 * gives its buy box `minmax(0,1fr)` out of the same
 * `minmax(0,1fr)_minmax(0,1.8fr)_minmax(0,1fr)` template. A fixed column and
 * a proportional one land on the same pixel width only by accident, and
 * measured apart at 1024 and 1440 (see report.md).
 *
 * `templates/index.tsx` is an async server component (next-intl/server,
 * backend fetches) this package cannot render in vitest without mocking the
 * whole data layer, so this reads the JSX as text, the same reason the panel
 * tests do (see apps/tenant-panel's own note on this).
 */

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, "index.tsx"), "utf8")

const BUY_BOX_TEMPLATE = "minmax(0,1fr)_minmax(0,1.8fr)_minmax(0,1fr)"

describe("course page buy box column", () => {
  it("uses the same three-way column template as the normal product page", () => {
    const occurrences = source.split(BUY_BOX_TEMPLATE).length - 1
    expect(occurrences).toBe(2) // once for the normal layout, once for the course layout
  })

  it("no longer pins the buy box to a fixed 24rem column", () => {
    expect(source).not.toContain("24rem")
  })

  it("the buy box sits in the template's third column on the course layout", () => {
    expect(source).toContain("small:col-start-3 small:row-span-2 small:row-start-1")
  })
})
