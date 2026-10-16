import { useLocation } from "react-router-dom"

import { MARKETPLACE_BY_SLUG, type MarketplaceId } from "../../../hooks/api/marketplace-section"

/**
 * The marketplace a screen is mounted for, read from its address
 * (t-2026-10-16-37): `/marketplaces/ozon/orders` is Ozon,
 * `/marketplaces/wildberries/orders` is Wildberries. The screens are one set
 * of components, and the route table mounts them once per marketplace, so the
 * address is the one place that knows which.
 *
 * An address outside `/marketplaces/<slug>/` is Wildberries, the default the
 * screens had before Ozon got its own routes.
 */
export const useRouteMarketplace = (): MarketplaceId => {
  const { pathname } = useLocation()
  const [, root, slug] = pathname.split("/")
  return (root === "marketplaces" && MARKETPLACE_BY_SLUG[slug ?? ""]) || "wb"
}
