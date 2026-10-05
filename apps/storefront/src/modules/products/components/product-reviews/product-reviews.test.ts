import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * ask da22. Ivan: «что-то со звездами и ширина неверная, она должна быть как и
 * ширина контента без ширины сайдбара справа». The rating field drew a whole
 * five-star `StarRating` inside each of its five buttons, 25 stars, and the block
 * ran the full width of the page, under the buy box. Both are asserted on the
 * source, the convention `checkout/page.test.ts` uses: the block is an async
 * server component and the form a client island with a server action behind it.
 */

const form = readFileSync(join(__dirname, "review-form.tsx"), "utf8")
const block = readFileSync(join(__dirname, "index.tsx"), "utf8")
const template = readFileSync(join(__dirname, "../../templates/index.tsx"), "utf8")
const PRODUCT_REVIEWS_GRID = block.match(/PRODUCT_REVIEWS_GRID =\s*"([^"]+)"/)?.[1] ?? ""

describe("ReviewForm: the rating field is five stars, one per button", () => {
  it("does not draw the five-star row inside a button", () => {
    expect(form).not.toContain("<StarRating")
    expect(form).not.toMatch(/import StarRating/)
  })

  it("draws one filled or one empty star per rating button", () => {
    expect(form.match(/<StarSolid /g)).toHaveLength(1)
    expect(form.match(/<Star /g)).toHaveLength(1)
    expect(form).toMatch(/\[1, 2, 3, 4, 5\]\.map\(\(value\) =>/)
  })
})

describe("ProductReviews: as wide as the content without the buy box", () => {
  const columns = "small:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)_minmax(0,1fr)]"

  it("uses the product page's own three columns", () => {
    expect(PRODUCT_REVIEWS_GRID).toContain(columns)
    // Both layouts of the page, the course one and the ordinary one.
    expect(template.split(columns)).toHaveLength(3)
  })

  it("has the gap the page has, or two columns would not add up to the same width", () => {
    expect(PRODUCT_REVIEWS_GRID).toContain("small:gap-6")
    expect(template).toContain(`gap-4 ${columns} small:gap-6`)
  })

  it("spans the first two columns and leaves the third, under the buy box, empty", () => {
    expect(block).toMatch(/content-container[^"`]*\$\{PRODUCT_REVIEWS_GRID\}/)
    expect(block).toContain("small:col-span-2")
  })
})
