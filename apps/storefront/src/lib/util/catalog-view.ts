/**
 * How a listing of products is drawn (ask a0e1, t-2026-10-06-09): the buyer's own choice on
 * the catalog, a category and a collection. How many it holds is no choice: a product list has
 * no pages (rule 5zg, t-2026-10-09-75), so the page-size cookie of a0e1 is read by nothing.
 *
 * The choice is a preference, not an address: it lives in a cookie, so it follows the buyer
 * from one category to the next and no link has to carry it. The listing reads it on the
 * server (`catalogListingView`), the control writes it and asks for the page again.
 */
export const CATALOG_VIEWS = ["grid", "list", "compact"] as const

export type CatalogView = (typeof CATALOG_VIEWS)[number]

export const DEFAULT_CATALOG_VIEW: CatalogView = "grid"

export const CATALOG_VIEW_COOKIE = "catalog_view"

/** The view a cookie names; anything else, and no cookie at all, is the grid. */
export const parseCatalogView = (raw: string | null | undefined): CatalogView =>
  (CATALOG_VIEWS as readonly string[]).includes(raw ?? "") ? (raw as CatalogView) : DEFAULT_CATALOG_VIEW

/**
 * The switch the controls sit behind. Without it a shop's listing and the dictionary its pages
 * hand to the browser stay exactly what they were before the controls existed, whatever cookie
 * a buyer carries.
 */
export const CATALOG_VIEW_CONTROLS_ENV = "STOREFRONT_CATALOG_VIEW_CONTROLS"

type Env = Record<string, string | undefined>

/**
 * On for `1` and for `true`, which is every shop of the deployment, or for a shop whose
 * handle a comma-separated list names. Off for anything else and for no value. The
 * storefront reads it on the server at render time, so you change it with the container's
 * environment and a restart, with no rebuild.
 */
export const catalogViewControlsEnabled = (handle: string | null, env: Env = process.env): boolean => {
  const value = (env[CATALOG_VIEW_CONTROLS_ENV] ?? "").trim()

  if (value.toLowerCase() === "1" || value.toLowerCase() === "true") {
    return true
  }

  return (
    handle !== null &&
    value
      .split(",")
      .map((entry) => entry.trim())
      .includes(handle)
  )
}
