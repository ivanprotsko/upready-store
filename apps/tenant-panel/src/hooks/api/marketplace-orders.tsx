import { FetchError } from "@medusajs/js-sdk"
import { QueryKey, UseQueryOptions, useQuery } from "@tanstack/react-query"

import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// tenant-panel: own hooks, no Admin counterpart — GET /tenants/marketplace-orders
// and GET /tenants/marketplace-orders/:id per w15-mp-orders-desk.
//
// READ-ONLY. There is no mutation hook in this file and there will not be one:
// the screen shows what the imports put into `mp_order` and changes nothing on
// a marketplace (Ivan, 2026-09-16 02:46 WITA). The backend suite
// `modules/marketplace/__tests__/order-feed-read-only.unit.spec.ts` reads this
// file and fails on a `useMutation` appearing in it.

export type FeedSource = "shop" | "wb" | "ozon"

export type OrderStatusKey =
  | "new"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "returned"
  | "unspecified"
  | "other"

export type FeedOrder = {
  id: string
  source: FeedSource
  source_label: string
  number: string
  scheme: string | null
  /** The marketplace's own word, shown as it came. */
  status_raw: string | null
  status_detail: string | null
  status_key: OrderStatusKey
  status_label: string
  ordered_at: string | null
  buyer_region: string | null
  warehouse_name: string | null
  total: number | null
  currency: string | null
  is_cancelled: boolean
  lines_count: number
}

export type FeedFacet = { value: string; label: string; count: number }

export type FeedConnection = {
  marketplace: string
  label: string
  /** false — «нет подключения»: the shop has no key for this marketplace. */
  connected: boolean
  last_run: {
    kind: string
    status: string
    started_at: string | null
    finished_at: string | null
    rows: number | null
    error: string | null
    is_fixture: boolean
  } | null
  rows_in_period: number
  /**
   * What the screen must say about this marketplace, decided by the backend's
   * `connectionNotice()` and covered by its unit tests. `null` — nothing to say.
   */
  notice: "missing" | "never_run" | "failed" | "rate_limited" | "fixture" | null
}

export type MarketplaceOrdersResponse = {
  orders: FeedOrder[]
  count: number
  offset: number
  limit: number
  period: {
    from: string
    to: string
    /** `YYYY-MM-DD` — what the screen prints. An instant would shift by a timezone. */
    from_day: string
    to_day: string
    days: number
    /** true when the screen chose the period, not the owner: it must say so. */
    is_default: boolean
    default_days: number
  }
  applied: { source: FeedSource[]; scheme: string[]; status: OrderStatusKey[] }
  facets: { sources: FeedFacet[]; schemes: FeedFacet[]; statuses: FeedFacet[] }
  connections: FeedConnection[]
  /** Orders the marketplace sent without a date; they fall in no period. */
  undated: number
}

export type MarketplaceOrderLine = {
  id: string
  line_key: string
  vendor_code: string | null
  external_id: string | null
  qty: number | null
  price: number | null
  discount: number | null
  marketplace_title: string | null
  /** null — «нет в магазине»: the article has no product in this shop. */
  product: {
    id: string
    variant_id: string | null
    title: string | null
    handle: string | null
    matched_by: string
  } | null
}

export type MarketplaceOrderDetail = {
  order: FeedOrder & {
    status_changed_at: string | null
    synced_at: string | null
    source_row_id: string | null
  }
  lines: MarketplaceOrderLine[]
  /** What WE saw at each import, not a log the marketplace keeps. */
  status_history: {
    status: string | null
    status_detail: string | null
    status_changed_at: string | null
    observed_at: string | null
  }[]
}

const MARKETPLACE_ORDERS_QUERY_KEY = "tenant-marketplace-orders" as const
export const marketplaceOrdersQueryKeys = queryKeysFactory(MARKETPLACE_ORDERS_QUERY_KEY)

/** The path the export is downloaded from, with the screen's own filters on it. */
export const marketplaceOrdersExportPath = (search: string) =>
  `/tenants/marketplace-orders/export${search ? `?${search.replace(/^\?/, "")}` : ""}`

export const useMarketplaceOrders = (
  search: string,
  options?: Omit<
    UseQueryOptions<MarketplaceOrdersResponse, FetchError, MarketplaceOrdersResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const query = search.replace(/^\?/, "")

  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<MarketplaceOrdersResponse>(
        `/tenants/marketplace-orders${query ? `?${query}` : ""}`
      ),
    queryKey: marketplaceOrdersQueryKeys.list(query),
    ...options,
  })

  // Named fields rather than `...data`, for the reason the marketplaces hook
  // records: react-query's own result carries `status`, and a response field of
  // the same name would be overwritten by it.
  return { feed: data, ...rest }
}

export const useMarketplaceOrder = (
  id: string,
  options?: Omit<
    UseQueryOptions<MarketplaceOrderDetail, FetchError, MarketplaceOrderDetail, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.client.fetch<MarketplaceOrderDetail>(`/tenants/marketplace-orders/${id}`),
    queryKey: marketplaceOrdersQueryKeys.detail(id),
    ...options,
  })

  return { detail: data, ...rest }
}
