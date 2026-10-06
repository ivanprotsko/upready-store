import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Ivan, 27.09.2026: «и еще, я ранее говорил, что 3 колонки в 1 ряд с товарами должно
 * появляться только при ширине <=960». On the Olavka shops the product grid is two columns
 * below 720, three from 720 to 960 and four above 960. The rule was built that day on a
 * branch that never came to dev, so dev kept three columns from 1024 (Ivan, 06.10.2026:
 * «в какой-то момент это не влили или не сделали или перезаписали»). This suite pins the
 * widths and the pieces that have to follow them, so that losing the rule again fails here.
 *
 * `ProductCard` is an async Server Component this package has no renderer for, so the
 * class strings are read from the source, the convention `footer/variants/olavka.test.ts`
 * uses.
 */
const here = dirname(fileURLToPath(import.meta.url))
const modules = join(here, "../../..")
const read = (path: string) => readFileSync(join(modules, path), "utf8")

const productCard = read("products/components/product-card/index.tsx")
const constant = (name: string) =>
  productCard.match(new RegExp(`export const ${name} =\\s*["\`]([^"\`]+)["\`]`))?.[1] ?? ""

const grid = constant("PRODUCT_GRID_CLASS")
const besideSidebar = constant("PRODUCT_GRID_BESIDE_SIDEBAR_CLASS")
const catalogColumns = constant("CATALOG_COLUMNS_CLASS")
const catalogMainColumn = constant("CATALOG_MAIN_COLUMN_CLASS")
const budgetLong = productCard.match(/\blong:\s*"([^"]+)"/)?.[1] ?? ""
const budgetShort = productCard.match(/\bshort:\s*"([^"]+)"/)?.[1] ?? ""
const collapsedItem = constant("PRODUCT_GRID_COLLAPSED_ITEM_CLASS")

const OLAVKA = "[[data-shop=olavka]_&]:"
const THREE_FROM = "min-[720px]:"
const FOUR_FROM = "min-[961px]:"
const SIDE_COLUMN_FROM = "min-[1024px]:"

const classes = (value: string) => value.split(/\s+/).filter(Boolean)

describe("product grid: three columns from 720 and four above 960 on the Olavka shops", () => {
  it("reads every class string from the source", () => {
    for (const value of [
      grid,
      besideSidebar,
      catalogColumns,
      catalogMainColumn,
      budgetLong,
      budgetShort,
      collapsedItem,
    ]) {
      expect(value).toBeTruthy()
    }
  })

  it("turns three columns at 720 and four at 961", () => {
    expect(classes(grid)).toContain(`${OLAVKA}${THREE_FROM}grid-cols-3`)
    expect(classes(grid)).toContain(`${OLAVKA}${FOUR_FROM}grid-cols-4`)
  })

  it("keeps every other shop on two, three from 1024 and four from 1440", () => {
    expect(classes(grid)).toEqual(
      expect.arrayContaining(["grid-cols-2", "small:grid-cols-3", "large:grid-cols-4"])
    )
  })

  it("shows all twelve cards of a home teaser from the width it has three columns", () => {
    expect(classes(budgetLong)).toContain(`${OLAVKA}${THREE_FROM}[&>li:nth-child(n+9)]:block`)
  })

  it("shows six of eight cards on three columns and all eight on four", () => {
    expect(classes(budgetShort)).toContain(`${OLAVKA}${THREE_FROM}[&>li:nth-child(n+7)]:hidden`)
    expect(classes(budgetShort)).toContain(`${OLAVKA}${FOUR_FROM}[&>li:nth-child(n+7)]:block`)
  })

  it("gives a collapsed card its three-column width from the same 720, on either gap", () => {
    expect(classes(collapsedItem)).toContain(`${OLAVKA}${THREE_FROM}w-[calc((100%-1.5rem)/3)]`)
    expect(classes(collapsedItem)).toContain(`${OLAVKA}min-[1024px]:w-[calc((100%-3rem)/3)]`)
  })
})

/**
 * Ivan, 06.10.2026: «максимальное число колонок страницы = 4, поэтому на этой странице при
 * наличии сайдабара можно отображать три колонки в ряд, чтобы данные футера выравнивались
 * правильно». On the Olavka shops the catalog's page is four equal columns from 1024: the
 * side column in the first, three cards in the other three, on the gap the product grid has
 * at that width. The Olavka footer stands on the same four tracks with its first one empty
 * (`footer/variants/olavka.test.ts`), so a footer column starts where a card column starts.
 * Four cards beside the side column, which dev had from 1280, are tracks of their own and
 * meet no footer column.
 */
describe("product grid beside the catalog's side column", () => {
  const templates = [
    "store/templates/index.tsx",
    "categories/templates/index.tsx",
    "collections/templates/index.tsx",
  ]
  const own = (value: string) => classes(value.replace("${PRODUCT_GRID_CLASS} ", ""))

  it("is the page's grid plus its own columns", () => {
    expect(besideSidebar.startsWith("${PRODUCT_GRID_CLASS} ")).toBe(true)
  })

  it("is three columns from where the side column appears and never turns four", () => {
    expect(own(besideSidebar)).toEqual([`${OLAVKA}${SIDE_COLUMN_FROM}grid-cols-3`])
  })

  it("makes the page four equal columns there, the side column in the first one", () => {
    expect(classes(catalogColumns)).toContain(`${OLAVKA}${SIDE_COLUMN_FROM}grid-cols-4`)
    expect(classes(catalogMainColumn)).toContain(`${OLAVKA}${SIDE_COLUMN_FROM}col-span-3`)
  })

  it("puts the page's columns on the gap the product grid has from 1024", () => {
    // Tailwind's `small` is 1024 in this package (`tailwind.config.js`).
    expect(classes(grid)).toContain("small:gap-x-6")
    expect(classes(catalogColumns)).toContain(`${OLAVKA}${SIDE_COLUMN_FROM}gap-x-6`)
  })

  it("keeps every other shop on a side column of 248", () => {
    // Tailwind's `lg` is 1024, the width `SIDE_COLUMN_FROM` names.
    expect(classes(catalogColumns)).toEqual(
      expect.arrayContaining(["grid-cols-1", "gap-8", "lg:grid-cols-[248px_1fr]"])
    )
  })

  it.each(templates)("%s: stands on the page's columns and the loader knows it", (path) => {
    const template = read(path)
    expect(template).toContain("className={CATALOG_COLUMNS_CLASS}")
    expect(template).toContain("className={CATALOG_MAIN_COLUMN_CLASS}")
    expect(template).toMatch(/<SkeletonProductGrid[^>]*\bbesideSidebar\b/)
  })

  it("is the grid of the catalog's list", () => {
    const list = read("store/templates/paginated-products.tsx")
    expect(list).toContain("className={PRODUCT_GRID_BESIDE_SIDEBAR_CLASS}")
    expect(list).not.toMatch(/\bPRODUCT_GRID_CLASS\b/)
  })
})
