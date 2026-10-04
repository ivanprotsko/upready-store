import { FetchError } from "@medusajs/js-sdk"
import { QueryKey, UseQueryOptions, useQuery } from "@tanstack/react-query"

import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"
import type { FeedConnection, FeedFacet, FeedOrder } from "./marketplace-orders"
import type { DeskGenerator, DeskItem, DeskKind } from "./marketplace-desk"
import type { MarketplaceSyncEntry, MarketplaceSyncWarning } from "./marketplace-sync"
import { fixtureAnalytics, fixtureOrders, fixturePriceStock, fixtureProducts, fixtureReviews, fixtureSync } from "./marketplace-section.fixtures"

/**
 * The screens of ONE marketplace (mp-section-design, Ivan 2026-10-05):
 * «Wildberries → Товары, Цены и остатки, Заказы, Отзывы, Аналитика,
 * Обновление». One hook per screen, every list paged and filtered by the
 * backend the way `/tenants/products` is, so the screens can be built on the
 * same `_DataTable` as «Товары» of the shop.
 *
 * THE ADDRESSES BELOW ARE THE CONTRACT for the backend tasks (task-02…07 of
 * the design round). Until a route exists the screen runs on fixtures:
 * `VITE_MP_FIXTURES=1` makes every hook answer from
 * `marketplace-section.fixtures.ts` without a request, which is how the
 * reference screenshots of the design round were taken. The flag is read at
 * build time and is never set on a live panel.
 */

export const MP_FIXTURES = import.meta.env.VITE_MP_FIXTURES === "1"

export type MarketplaceId = "wb" | "ozon"

export const MARKETPLACE_BY_SLUG: Record<string, MarketplaceId> = {
  wildberries: "wb",
  ozon: "ozon",
}

/** `wb` → `wildberries`, for an address. */
export const slugOf = (marketplace: MarketplaceId): string =>
  marketplace === "wb" ? "wildberries" : marketplace

export const MARKETPLACE_LABEL: Record<MarketplaceId, string> = {
  wb: "Wildberries",
  ozon: "Ozon",
}

const KEY = "tenant-marketplace-section" as const
export const marketplaceSectionQueryKeys = queryKeysFactory(KEY)

type ListParams = {
  limit?: number
  offset?: number
  q?: string
  order?: string
  [key: string]: string | number | string[] | undefined
}

const toQuery = (params: ListParams): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
      continue
    }
    out[key] = Array.isArray(value) ? value.join(",") : String(value)
  }
  return out
}

type Options<T> = Omit<UseQueryOptions<T, FetchError, T, QueryKey>, "queryFn" | "queryKey">

/* ----------------------------------------------------------------------------
 * «Товары»: the cards of the marketplace as stored in `mp_product`
 * ------------------------------------------------------------------------- */

export type MpLinkState = "linked" | "not_found" | "needs_choice"

export type MpProductRow = {
  id: string
  marketplace: MarketplaceId
  /** WB `nmID`, Ozon `product_id`. */
  external_id: string
  vendor_code: string | null
  title: string | null
  brand: string | null
  category_name: string | null
  thumbnail: string | null
  photos_count: number
  /** The card's price on the marketplace, in the seller's currency; the discounted one when it has one. */
  price: number | null
  discount_price: number | null
  currency: string | null
  /** Σ stock over the card's offer lines; `null` when the marketplace said nothing. */
  stock: number | null
  /** Offer lines (sizes × warehouses) behind the card. */
  offers: number
  link: {
    state: MpLinkState
    product_id: string | null
    product_title: string | null
    variant_id: string | null
    matched_by: "vendor_code" | "manual" | null
    candidates: number
  }
  /** When the card last changed ON the marketplace, where it says. */
  mp_updated_at: string | null
  /** When WE last wrote this row from the marketplace's answer. */
  synced_at: string
  /** The card on the marketplace's site, for «Открыть на Wildberries». */
  url: string | null
}

export type MpProductsResponse = {
  products: MpProductRow[]
  count: number
  limit: number
  offset: number
  /** The import behind the list: when it last succeeded and what it brought. */
  sync: {
    kind: string
    last_success_at: string | null
    cards: number
    status: string | null
  }
  categories: Array<{ value: string; label: string; count: number }>
  brands: Array<{ value: string; label: string; count: number }>
}

export type MpProductsParams = ListParams & {
  link_state?: MpLinkState[]
  category?: string[]
  brand?: string[]
  synced_at?: string
}

/** `GET /tenants/marketplaces/:marketplace/products` (task-02). */
export const useMpProducts = (
  marketplace: MarketplaceId,
  params: MpProductsParams,
  options?: Options<MpProductsResponse>
) => {
  const query = toQuery(params)
  const { data, ...rest } = useQuery({
    queryKey: marketplaceSectionQueryKeys.list({ marketplace, kind: "products", ...query }),
    queryFn: () =>
      MP_FIXTURES
        ? Promise.resolve(fixtureProducts(marketplace, params))
        : sdk.client.fetch<MpProductsResponse>(`/tenants/marketplaces/${marketplace}/products`, {
            query,
          }),
    ...options,
  })
  return { ...data, ...rest }
}

/* ----------------------------------------------------------------------------
 * «Цены и остатки»: the shop's number next to the marketplace's, one row per card
 * ------------------------------------------------------------------------- */

export type MpPriceStockState = "both" | "shop_only" | "marketplace_only"

export type MpPriceStockRow = {
  id: string
  external_id: string | null
  vendor_code: string
  title: string | null
  thumbnail: string | null
  state: MpPriceStockState
  shop: {
    product_id: string
    variant_id: string
    title: string | null
    price: number | null
    stock: number | null
  } | null
  mp: {
    price: number | null
    discount_price: number | null
    stock: number | null
    reserved: number | null
    lines: number
    warehouses: number
    sizes: number
    price_measured_at: string | null
    stock_measured_at: string | null
    /** Older than three import intervals (prices 3 h, stocks 45 min). */
    price_stale: boolean
    stock_stale: boolean
  } | null
  diff: {
    price_abs: number | null
    price_pct: number | null
    stock_abs: number | null
    /** Over the thresholds the query carried. */
    highlighted: boolean
  }
  currency: string | null
}

export type MpPriceStockResponse = {
  rows: MpPriceStockRow[]
  count: number
  limit: number
  offset: number
  thresholds: { price_pct: number; stock_abs: number }
  counts: Record<MpPriceStockState | "over_threshold", number>
  measured: { prices_at: string | null; stocks_at: string | null }
}

export type MpPriceStockParams = ListParams & {
  state?: MpPriceStockState[]
  over_threshold?: "true"
  price_pct?: number
  stock_abs?: number
}

/** `GET /tenants/marketplaces/:marketplace/price-stock` (task-03). */
export const useMpPriceStock = (
  marketplace: MarketplaceId,
  params: MpPriceStockParams,
  options?: Options<MpPriceStockResponse>
) => {
  const query = toQuery(params)
  const { data, ...rest } = useQuery({
    queryKey: marketplaceSectionQueryKeys.list({ marketplace, kind: "price-stock", ...query }),
    queryFn: () =>
      MP_FIXTURES
        ? Promise.resolve(fixturePriceStock(marketplace, params))
        : sdk.client.fetch<MpPriceStockResponse>(
            `/tenants/marketplaces/${marketplace}/price-stock`,
            { query }
          ),
    ...options,
  })
  return { ...data, ...rest }
}

/** The CSV of the same rows, with the same query string (task-03). */
export const mpPriceStockExportPath = (marketplace: MarketplaceId, params: MpPriceStockParams) => {
  const search = new URLSearchParams(toQuery(params)).toString()
  return `/tenants/marketplaces/${marketplace}/price-stock/export${search ? `?${search}` : ""}`
}

/* ----------------------------------------------------------------------------
 * «Заказы»: the marketplace's orders as the import stored them
 * ------------------------------------------------------------------------- */

export type MpOrdersResponse = {
  orders: FeedOrder[]
  count: number
  limit: number
  offset: number
  facets: { schemes: FeedFacet[]; statuses: FeedFacet[] }
  connection: FeedConnection
  /** Orders the marketplace sent without a date; they fall in no period. */
  undated: number
}

export type MpOrdersParams = ListParams & {
  status?: string[]
  scheme?: string[]
  ordered_at?: string
}

/** `GET /tenants/marketplaces/:marketplace/orders` (task-04). */
export const useMpOrders = (
  marketplace: MarketplaceId,
  params: MpOrdersParams,
  options?: Options<MpOrdersResponse>
) => {
  const query = toQuery(params)
  const { data, ...rest } = useQuery({
    queryKey: marketplaceSectionQueryKeys.list({ marketplace, kind: "orders", ...query }),
    queryFn: () =>
      MP_FIXTURES
        ? Promise.resolve(fixtureOrders(marketplace, params))
        : sdk.client.fetch<MpOrdersResponse>(`/tenants/marketplaces/${marketplace}/orders`, {
            query,
          }),
    ...options,
  })
  return { ...data, ...rest }
}

export const mpOrdersExportPath = (marketplace: MarketplaceId, params: MpOrdersParams) => {
  const search = new URLSearchParams(toQuery(params)).toString()
  return `/tenants/marketplaces/${marketplace}/orders/export${search ? `?${search}` : ""}`
}

/* ----------------------------------------------------------------------------
 * «Отзывы»: reviews and questions of the marketplace's buyers
 * ------------------------------------------------------------------------- */

export type MpReviewsResponse = {
  items: DeskItem[]
  count: number
  limit: number
  offset: number
  counts: {
    reviews: { total: number; unanswered: number }
    questions: { total: number; unanswered: number }
  }
  generator: DeskGenerator
  /** One sentence: why there is no «отправить» (the marketplaces are read-only). */
  sending: { enabled: false; reason: string }
}

export type MpReviewsParams = ListParams & {
  kind?: DeskKind[]
  rating?: string[]
  answered?: ("yes" | "no")[]
  created_at?: string
}

/** `GET /tenants/marketplaces/:marketplace/reviews` (task-05). */
export const useMpReviews = (
  marketplace: MarketplaceId,
  params: MpReviewsParams,
  options?: Options<MpReviewsResponse>
) => {
  const query = toQuery(params)
  const { data, ...rest } = useQuery({
    queryKey: marketplaceSectionQueryKeys.list({ marketplace, kind: "reviews", ...query }),
    queryFn: () =>
      MP_FIXTURES
        ? Promise.resolve(fixtureReviews(marketplace, params))
        : sdk.client.fetch<MpReviewsResponse>(`/tenants/marketplaces/${marketplace}/reviews`, {
            query,
          }),
    ...options,
  })
  return { ...data, ...rest }
}

/* ----------------------------------------------------------------------------
 * «Аналитика»: the seller's dashboard of one marketplace
 * ------------------------------------------------------------------------- */

export type MpAnalyticsResponse = {
  period: { from_day: string; to_day: string; days: number; is_default: boolean; default_days: number }
  currency: string | null
  totals: {
    revenue: number
    orders: number
    units: number
    avg_order: number | null
    cancelled_orders: number
    cancelled_revenue: number
    cards_with_sales: number
    cards_total: number
    stock_units: number | null
    stock_days_left: number | null
  }
  by_day: Array<{ day: string; revenue: number; orders: number; units: number; cancelled_units: number; cancelled_revenue: number }>
  cards: Array<{
    id: string
    external_id: string | null
    vendor_code: string | null
    title: string | null
    thumbnail: string | null
    revenue: number
    units: number
    orders: number
    avg_price: number | null
    revenue_share: number
    abc: "A" | "B" | "C"
    xyz: "X" | "Y" | "Z" | null
    stock: number | null
    days_to_zero: number | null
  }>
  cards_count: number
  limit: number
  offset: number
  rating: { value: number | null; scale: number | null; detail: string }
  connection: FeedConnection
}

export type MpAnalyticsParams = ListParams & { from?: string; to?: string }

/** `GET /tenants/marketplaces/:marketplace/analytics` (task-06). */
export const useMpAnalytics = (
  marketplace: MarketplaceId,
  params: MpAnalyticsParams,
  options?: Options<MpAnalyticsResponse>
) => {
  const query = toQuery(params)
  const { data, ...rest } = useQuery({
    queryKey: marketplaceSectionQueryKeys.list({ marketplace, kind: "analytics", ...query }),
    queryFn: () =>
      MP_FIXTURES
        ? Promise.resolve(fixtureAnalytics(marketplace, params))
        : sdk.client.fetch<MpAnalyticsResponse>(`/tenants/marketplaces/${marketplace}/analytics`, {
            query,
          }),
    ...options,
  })
  return { analytics: data, ...rest }
}

/* ----------------------------------------------------------------------------
 * «Обновление»: the schedule of one marketplace
 * ------------------------------------------------------------------------- */

export type MpSyncResponse = {
  marketplace: MarketplaceSyncEntry
  warnings: MarketplaceSyncWarning[]
  schedule: { cron: string; stale_lock_ms: number; expiry_warning_days: number }
  now: string
}

/** `GET /tenants/marketplaces/:marketplace/sync` (task-07), a view of `/tenants/marketplaces/sync` for one marketplace. */
export const useMpSync = (marketplace: MarketplaceId, options?: Options<MpSyncResponse>) => {
  const { data, ...rest } = useQuery({
    queryKey: marketplaceSectionQueryKeys.detail(`${marketplace}-sync`),
    queryFn: () =>
      MP_FIXTURES
        ? Promise.resolve(fixtureSync(marketplace))
        : sdk.client.fetch<MpSyncResponse>(`/tenants/marketplaces/${marketplace}/sync`),
    ...options,
  })
  return { sync: data, ...rest }
}
