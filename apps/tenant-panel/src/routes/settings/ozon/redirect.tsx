import { Navigate, useLocation } from "react-router-dom"

/**
 * `/settings/ozon` -> `/settings/marketplaces/ozon`
 * (p01-settings-integrations-restructure).
 *
 * w24 pointed this path at the shared hub with an `#ozon` anchor, because the card
 * was a section of the shared hub. Ivan's order of 2026-09-16 20:22 WITA gives
 * Ozon its own address and bans the anchor, so the path keeps working and lands
 * on that page. Where the owner enters her Client-Id and key is one link away,
 * at `/settings/integrations/ozon`. The query string is carried over, as on
 * every old address of the section (mp-section-design).
 */
export const OzonRedirect = () => {
  const { search } = useLocation()
  return <Navigate replace to={`/settings/marketplaces/ozon${search}`} />
}
