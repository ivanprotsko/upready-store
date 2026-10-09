import { cookies } from "next/headers"

import { getTenantHandle } from "./cookies"
import { OLAVKA_SHOP_HANDLES } from "./olavka-shop"
import {
  CATALOG_VIEW_COOKIE,
  DEFAULT_CATALOG_VIEW,
  catalogViewControlsEnabled,
  parseCatalogView,
  type CatalogView,
} from "@lib/util/catalog-view"

/**
 * Whether this request's listing gets the view controls (ask a0e1): the deployment's
 * switch names the shop (`catalogViewControlsEnabled`), and the shop is none of the Olavka
 * ones, which keep their own grid whatever the switch says (Ivan's widths of 27.09). A
 * header read, no fetch, so the page's dictionary can ask it too.
 */
export async function catalogViewControlsOn(): Promise<boolean> {
  const handle = await getTenantHandle()

  if (handle !== null && OLAVKA_SHOP_HANDLES.has(handle)) {
    return false
  }

  return catalogViewControlsEnabled(handle)
}

/**
 * How this request draws a product list: the buyer's view from its cookie when the shop has the
 * controls, the grid otherwise, with no cookie read at all. The server's first screens and every
 * batch the browser asks for later read it here, so the two never draw different cards.
 */
export async function catalogListingView(): Promise<{ controls: boolean; view: CatalogView }> {
  const controls = await catalogViewControlsOn()

  if (!controls) {
    return { controls, view: DEFAULT_CATALOG_VIEW }
  }

  const cookieStore = await cookies()

  return { controls, view: parseCatalogView(cookieStore.get(CATALOG_VIEW_COOKIE)?.value) }
}
