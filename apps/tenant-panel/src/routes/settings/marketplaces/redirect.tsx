import { Navigate, useLocation } from "react-router-dom"

import { slugForMarketplaceId } from "../integrations/marketplace-slug"

/**
 * `/settings/marketplaces` -> `/settings/integrations`, and the old ANCHORS to
 * the marketplace pages (p01-settings-integrations-restructure).
 *
 * Ivan, 2026-09-16 20:22 WITA: «были сделаны пункты навигации для WB
 * settings/marketplaces с якорем в левом сайдбаре, но это не правильно делать
 * отдельный пункт для навигации в внутри одной страницы через якорь #». The hub
 * that stacked every marketplace card is gone: the requisites live under
 * «Подключение» and each marketplace has a screen of its own.
 *
 * The hash is READ rather than dropped, because it is what the owner's
 * bookmarks and the previous sidebar carry: `#wb` and `#ozon` land on that
 * marketplace's screen, anything else on the hub. A hash naming no registered
 * marketplace is not an error — it is a stale bookmark, and the hub is the
 * honest answer to it (rule 20a: a miss is a no-op, not a pretend jump).
 *
 * `replace` so Back leaves the section instead of bouncing through the old path.
 */
export const MarketplacesRedirect = () => {
  const { hash } = useLocation()
  const slug = hash ? slugForMarketplaceId(hash.slice(1)) : null
  return <Navigate replace to={slug ? `/settings/marketplaces/${slug}` : "/settings/integrations"} />
}
