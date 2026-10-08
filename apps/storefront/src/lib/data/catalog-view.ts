import { getTenantHandle } from "./cookies"
import { OLAVKA_SHOP_HANDLES } from "./olavka-shop"
import { catalogViewControlsEnabled } from "@lib/util/catalog-view"

/**
 * Whether this request's listing gets the view controls (ask a0e1): the deployment's
 * switch names the shop (`catalogViewControlsEnabled`), and the shop is none of the Olavka
 * ones, which keep their own grid and page size whatever the switch says (Ivan's widths of
 * 27.09). A header read, no fetch, so the page's dictionary can ask it too.
 */
export async function catalogViewControlsOn(): Promise<boolean> {
  const handle = await getTenantHandle()

  if (handle !== null && OLAVKA_SHOP_HANDLES.has(handle)) {
    return false
  }

  return catalogViewControlsEnabled(handle)
}
