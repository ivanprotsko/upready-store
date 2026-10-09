import { describe, expect, it } from "vitest"

import * as catalogView from "./catalog-view"
import { DEFAULT_CATALOG_VIEW, parseCatalogView } from "./catalog-view"

describe("the catalog's view", () => {
  it("reads a view the controls offer and falls back to the grid for anything else", () => {
    expect(parseCatalogView("list")).toBe("list")
    expect(parseCatalogView("compact")).toBe("compact")
    expect(parseCatalogView("grid")).toBe("grid")
    expect(parseCatalogView("table")).toBe(DEFAULT_CATALOG_VIEW)
    expect(parseCatalogView("")).toBe(DEFAULT_CATALOG_VIEW)
    expect(parseCatalogView(undefined)).toBe(DEFAULT_CATALOG_VIEW)
  })

  // Rule 5zg (t-2026-10-09-75): a product list has no pages, so no page size to pick either.
  it("offers no page size: the a0e1 choice of 12, 24 or 48 is gone", () => {
    expect(Object.keys(catalogView).filter((name) => /PER_PAGE|PerPage/.test(name))).toEqual([])
  })
})
