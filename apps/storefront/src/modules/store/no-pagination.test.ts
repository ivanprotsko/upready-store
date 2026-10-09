import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * t-2026-10-09-75, rule 5zg. Ivan, 09.10.2026, about cherkashino.ru/ru/store: «убираем
 * пагинацию и больше никогда не делаем». No product list of the storefront has page numbers, a
 * «next page», a «show more» button or a «per page» choice: the catalog, a category, a brand
 * (a category of the brands branch), a collection, and the search palette.
 */
const SRC = join(__dirname, "../..")
const read = (path: string) => readFileSync(join(SRC, path), "utf8")

const sources: string[] = []
const walk = (dir: string) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) sources.push(full)
  }
}
walk(SRC)

const LIST_TEMPLATES = [
  "modules/store/templates/index.tsx",
  "modules/categories/templates/index.tsx",
  "modules/collections/templates/index.tsx",
]
const LIST_ROUTES = [
  "app/[locale]/(main)/store/page.tsx",
  "app/[locale]/(main)/categories/[...category]/page.tsx",
  "app/[locale]/(main)/collections/[handle]/page.tsx",
]

describe("rule 5zg: no product list has pages", () => {
  it("the pagination component is gone and nothing draws a page row or a page size", () => {
    expect(existsSync(join(SRC, "modules/store/components/pagination"))).toBe(false)
    const offenders = sources
      .filter((file) => /product-pagination|catalog-per-page|CATALOG_PER_PAGE|<Pagination\b/.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC, file))
    expect(offenders).toEqual([])
  })

  it.each(LIST_TEMPLATES)("%s takes no page and lists through ProductsListing", (path) => {
    const template = read(path)
    expect(template).not.toMatch(/\bpage\??:\s*string|pageNumber|page=\{/)
    expect(template).toMatch(/<ProductsListing\b/)
  })

  it.each(LIST_ROUTES)("%s reads no `page`: an old `?page=N` opens the list from its start", (path) => {
    const route = read(path)
    expect(route).toContain("const { sortBy } = searchParams")
    expect(route).not.toMatch(/page=\{page\}/)
  })

  it("the server always renders the list from its first product", () => {
    const listing = read("modules/store/templates/products-listing.tsx")
    expect(listing).toMatch(/listProductsWithSort\(\{\s*offset: 0,/)
    expect(listing).toContain("limit: FIRST_SCREENS_PRODUCTS")
  })

  it("the list brings the rest by itself: no «show more» button, no link to a next page", () => {
    const list = read("modules/store/components/infinite-products/index.tsx")
    expect(list).not.toMatch(/<button\b|<Link\b|<a\b|href=/)
    expect(list).toContain("loader.start(saved)")
  })

  it("the view control keeps the grid, rows and the dense grid, and offers no page size", () => {
    const controls = read("modules/store/components/view-controls/index.tsx")
    expect(controls).not.toMatch(/<select\b|perPage/)
    expect(controls).toContain("CATALOG_VIEWS.map")
  })

  it("the search palette shows its matches in one list with no pages", () => {
    const palette = read("modules/layout/components/search/palette.tsx")
    expect(palette).not.toMatch(/[?&]page=|offset|nextPage|loadMore|showMore/i)
  })
})
