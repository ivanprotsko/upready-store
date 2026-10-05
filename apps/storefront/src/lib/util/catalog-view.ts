/**
 * How a listing of products is drawn and how many it holds per page (ask a0e1,
 * t-2026-10-06-09): the buyer's own choice on the catalog, a category and a collection.
 *
 * The choice is a preference, not an address: it lives in two cookies, so it follows the
 * buyer from one category to the next and no link has to carry it. The listing reads them
 * on the server (`PaginatedProducts`), the controls write them and ask for the page again.
 */
export const CATALOG_VIEWS = ["grid", "list", "compact"] as const

export type CatalogView = (typeof CATALOG_VIEWS)[number]

export const DEFAULT_CATALOG_VIEW: CatalogView = "grid"

export const CATALOG_PER_PAGE_OPTIONS = [12, 24, 48] as const

export const DEFAULT_CATALOG_PER_PAGE = 12

export const CATALOG_VIEW_COOKIE = "catalog_view"

export const CATALOG_PER_PAGE_COOKIE = "catalog_per_page"

/** The view a cookie names; anything else, and no cookie at all, is the grid. */
export const parseCatalogView = (raw: string | null | undefined): CatalogView =>
  (CATALOG_VIEWS as readonly string[]).includes(raw ?? "") ? (raw as CatalogView) : DEFAULT_CATALOG_VIEW

/** The page size a cookie names, only when it is one the controls offer. */
export const parseCatalogPerPage = (raw: string | null | undefined): number => {
  const value = Number(raw)

  return (CATALOG_PER_PAGE_OPTIONS as readonly number[]).includes(value) ? value : DEFAULT_CATALOG_PER_PAGE
}
