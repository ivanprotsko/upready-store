import ShopNotFoundPage from "./page"
import { metadata as shopNotFoundMetadata } from "./layout"

/**
 * Here for its metadata, not as a boundary anyone throws into
 * (t-2026-10-12-32 FX4). The middleware answers this route with a 404, and
 * under a 404 Next resolves the tab title through the `not-found` convention:
 * the deepest not-found module wins (`resolve-metadata.js`, Next 15.5). Without
 * this file that was the root one, «Страница не найдена | Gorgo Medusa Store» —
 * the build profile's shop name on an address with no shop (measured on the
 * stand). The component is the page itself, should anything ever throw here.
 */
export const metadata = shopNotFoundMetadata

export default ShopNotFoundPage
