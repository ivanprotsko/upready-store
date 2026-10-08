import { describe, expect, it } from "vitest"

import {
  CATALOG_PER_PAGE_OPTIONS,
  DEFAULT_CATALOG_PER_PAGE,
  DEFAULT_CATALOG_VIEW,
  parseCatalogPerPage,
  parseCatalogView,
} from "./catalog-view"

describe("the catalog's view and page size", () => {
  it("reads a view the controls offer and falls back to the grid for anything else", () => {
    expect(parseCatalogView("list")).toBe("list")
    expect(parseCatalogView("compact")).toBe("compact")
    expect(parseCatalogView("grid")).toBe("grid")
    expect(parseCatalogView("table")).toBe(DEFAULT_CATALOG_VIEW)
    expect(parseCatalogView("")).toBe(DEFAULT_CATALOG_VIEW)
    expect(parseCatalogView(undefined)).toBe(DEFAULT_CATALOG_VIEW)
  })

  it("reads a page size the controls offer and never one a buyer typed into the cookie", () => {
    expect(parseCatalogPerPage("24")).toBe(24)
    expect(parseCatalogPerPage("48")).toBe(48)
    expect(parseCatalogPerPage("5000")).toBe(DEFAULT_CATALOG_PER_PAGE)
    expect(parseCatalogPerPage("0")).toBe(DEFAULT_CATALOG_PER_PAGE)
    expect(parseCatalogPerPage("abc")).toBe(DEFAULT_CATALOG_PER_PAGE)
    expect(parseCatalogPerPage(null)).toBe(DEFAULT_CATALOG_PER_PAGE)
  })

  it("keeps the default page size among the offered ones", () => {
    expect(CATALOG_PER_PAGE_OPTIONS).toContain(DEFAULT_CATALOG_PER_PAGE)
  })
})
