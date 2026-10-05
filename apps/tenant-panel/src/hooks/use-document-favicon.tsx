import { useEffect, useMemo } from "react"

import { FaviconLink, shopFaviconLinks } from "../lib/shop-favicon"
import { useTenantBranding } from "./api/branding"
import { useStore } from "./api/store"

/**
 * The tab icon's `<link>`s for the shop that is open (ask-20261006-021217-bd59), or `null`
 * while the answer is still on its way: the tab then keeps what it shows, so a shop with an
 * icon of its own never flashes the letter placeholder first.
 *
 * `retry: false` and the unauthenticated public layout: as in `useDocumentTitle`, the 401 of
 * `GET /tenants/store` is the answer «no shop», and the branding is not asked for at all.
 */
export function useShopFaviconLinks(): FaviconLink[] | null {
  const { store, isPending: isStorePending } = useStore({ retry: false })
  const { branding, isPending: isBrandingPending } = useTenantBranding({
    enabled: !!store,
    retry: false,
  })
  const name = store?.name

  return useMemo(() => {
    if (isStorePending || (!!store && isBrandingPending)) {
      return null
    }

    return shopFaviconLinks({ name, branding })
  }, [isStorePending, store, isBrandingPending, name, branding])
}

/**
 * Puts the open shop's icon on the browser tab. The header's shop switcher reloads the page,
 * so the next shop's icon arrives with its first answers; a new favicon saved on «Оформление»
 * arrives with the branding query it invalidates.
 *
 * The `<link>`s are replaced in the DOM directly, not through `react-helmet-async` as the
 * title is: Helmet adds its own tags next to the one `index.html` carries and would leave
 * two icons for the browser to pick from.
 */
export function DocumentFavicon() {
  const links = useShopFaviconLinks()

  useEffect(() => {
    if (!links) {
      return
    }

    document.head.querySelectorAll('link[rel~="icon"]').forEach((node) => node.remove())

    for (const link of links) {
      const node = document.createElement("link")
      node.rel = "icon"
      if (link.type) {
        node.type = link.type
      }
      if (link.sizes) {
        node.setAttribute("sizes", link.sizes)
      }
      node.href = link.href
      document.head.appendChild(node)
    }
  }, [links])

  return null
}
