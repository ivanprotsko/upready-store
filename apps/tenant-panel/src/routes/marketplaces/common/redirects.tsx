import { Navigate, useLocation, useParams } from "react-router-dom"

/**
 * The old addresses of the marketplace screens (mp-section-design). They are
 * in the owner's bookmarks, so each stays registered and redirects, the way
 * `/settings/wildberries` has since p01. `replace`, so Back leaves the section.
 *
 * `/marketplaces/catalog`            → `/marketplaces/wildberries/products`
 * `/marketplaces/price-stock`        → `/marketplaces/wildberries/price-stock`
 * `/marketplace-orders`              → `/marketplaces/wildberries/orders`
 * `/marketplace-orders/:id`          → `/marketplaces/wildberries/orders/:id`
 * `/settings/marketplaces/reviews`   → `/marketplaces/wildberries/reviews`
 * `/settings/marketplaces/sync`      → `/marketplaces/wildberries/sync`
 * `/settings/marketplaces/analytics` → `/marketplaces/wildberries/analytics`
 *
 * The query string is carried over: a filtered view someone sent keeps its
 * filters where the keys still mean the same thing.
 */
export const mpRedirect = (to: string) => {
  const Redirect = () => {
    const { search } = useLocation()
    const { id } = useParams()
    return <Navigate replace to={`${to}${id ? `/${id}` : ""}${search}`} />
  }
  return Redirect
}

export const CatalogRedirect = mpRedirect("/marketplaces/wildberries/products")
export const PriceStockRedirect = mpRedirect("/marketplaces/wildberries/price-stock")
export const OrdersRedirect = mpRedirect("/marketplaces/wildberries/orders")
export const ReviewsRedirect = mpRedirect("/marketplaces/wildberries/reviews")
export const SyncRedirect = mpRedirect("/marketplaces/wildberries/sync")
export const AnalyticsRedirect = mpRedirect("/marketplaces/wildberries/analytics")
