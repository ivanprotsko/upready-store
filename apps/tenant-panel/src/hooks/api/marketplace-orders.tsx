import { FetchError } from "@medusajs/js-sdk"
import { QueryKey, UseQueryOptions, useQuery } from "@tanstack/react-query"

import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// tenant-panel: own hooks, no Admin counterpart. The types of a marketplace
// order (w15-mp-orders-desk) and the card of one order,
// GET /tenants/marketplaces/:marketplace/orders/:id (mp-section-design task-04).
// The list of «Wildberries → Заказы» is `useMpOrders` in marketplace-section.tsx.
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
  /** The currency `total` is in: the seller's (WB stores the converted sum). */
  currency: string | null
  /** The code the marketplace put on the order: the buyer's country currency. */
  buyer_currency: string | null
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

export type MarketplaceOrderLine = {
  id: string
  line_key: string
  vendor_code: string | null
  external_id: string | null
  qty: number | null
  price: number | null
  discount: number | null
  marketplace_title: string | null
  /** The shop product's picture, else the marketplace card's first photo. */
  thumbnail: string | null
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

/** One order of one marketplace (`wb`, `ozon`); a foreign or missing id answers 404. */
export const useMarketplaceOrder = (
  marketplace: string,
  id: string,
  options?: Omit<
    UseQueryOptions<MarketplaceOrderDetail, FetchError, MarketplaceOrderDetail, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<MarketplaceOrderDetail>(
        `/tenants/marketplaces/${marketplace}/orders/${encodeURIComponent(id)}`
      ),
    queryKey: marketplaceOrdersQueryKeys.detail(`${marketplace}-${id}`),
    ...options,
  })

  return { detail: data, ...rest }
}
