import { FetchError } from "@medusajs/js-sdk"
import { QueryKey, UseQueryOptions, useQuery } from "@tanstack/react-query"

import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// tenant-panel: own hooks, no Admin counterpart — «Маркетплейсы → Цены и
// остатки» of w17-mp-price-stock-table.
//
// READ ONLY, and not by convention: this file exports no `useMutation` and no
// verb but GET, and `apps/backend/src/modules/marketplace/__tests__/price-stock-read-only.unit.spec.ts`
// fails the suite if one appears here. Ivan's invariant of 2026-09-16 02:46
// WITA: the screen SHOWS prices and stocks and never writes them anywhere.

/** The two families the freshness of this screen is about. */
export type PriceStockFamily = "prices" | "stocks"

export type Freshness = {
  family: PriceStockFamily
  /** The oldest line measurement behind the number (`mp_offer.measured_at`). */
  measured_at: string | null
  /** The last succeeded import of that family for that marketplace. */
  imported_at: string | null
  /** The older of the two: a number is never fresher than the import that brought it. */
  as_of: string | null
  age_ms: number | null
  interval_ms: number
  stale_after_ms: number
  stale: boolean
  /** One line naming both sources and the window (rule 18e). */
  note: string
}

export type PriceStockColumn = {
  marketplace: string
  external_ids: string[]
  price: number | null
  discount_price: number | null
  effective_price: number | null
  effective_basis: "discount_price" | "price" | null
  currency: string | null
  stock: number | null
  reserved: number | null
  lines: number
  stock_lines: number
  warehouses: number
  sizes: number
  price_freshness: Freshness
  stock_freshness: Freshness
}

export type PriceStockDifference = {
  marketplace: string
  metric: "price" | "stock"
  shop: number | null
  marketplace_value: number | null
  unit: string
  abs: number | null
  pct: number | null
  highlighted: boolean
  note: string
}

export type PriceStockGroup = "both" | "shop_only" | "marketplace_only"
export type PriceStockTab = PriceStockGroup | "over_threshold"

export type PriceStockRow = {
  vendor_code: string
  group: PriceStockGroup
  over_threshold: boolean
  shop: {
    variant_id: string
    product_id: string
    product_title: string | null
    sku: string | null
    price: number | null
    currency: string | null
    stock: number | null
  } | null
  columns: PriceStockColumn[]
  differences: PriceStockDifference[]
}

export type PriceStockCounts = {
  both: number
  shop_only: number
  marketplace_only: number
  total: number
  /** The sum of the three groups. Equal to `total` by construction. */
  accounted_for: number
  /** An OVERLAY on the three groups, never a fourth member of the partition. */
  over_threshold: number
  stale_columns: number
}

export type PriceStockThresholds = {
  price_pct: number
  stock_abs: number
}

export type PriceStockResponse = {
  rows: PriceStockRow[]
  counts: PriceStockCounts
  summary: string
  thresholds: PriceStockThresholds
  marketplaces: string[]
  marketplace_labels: Record<string, string>
  sources: { cards: string; lines: string; variants: string; imports: string }
  stored: { cards: number; lines: number; variants: number; imports: number }
  as_of: string
}

/** One `mp_offer` line of the expansion: one warehouse, one size. */
export type PriceStockLine = {
  marketplace: string
  external_id: string
  offer_key: string
  vendor_code: string | null
  size_external: string | null
  sku_external: string | null
  storage_type: string | null
  warehouse_id: string | null
  warehouse_name: string | null
  price: number | null
  discount_price: number | null
  currency: string | null
  stock: number | null
  reserved: number | null
  measured_at: string | null
}

export type PriceStockLinesResponse = {
  vendor_code: string
  columns: Array<{
    marketplace: string
    stock: number | null
    stock_lines: number
    price: number | null
    discount_price: number | null
    effective_price: number | null
    currency: string | null
    lines: PriceStockLine[]
  }>
  /** The sum recomputed from the returned lines, so the screen can assert it. */
  stock_check: Array<{
    marketplace: string
    collapsed: number | null
    sum_of_lines: number | null
  }>
}

export type PriceStockQuery = Partial<PriceStockThresholds> & { tab?: PriceStockTab }

const PRICE_STOCK_QUERY_KEY = "tenant-marketplace-price-stock" as const
export const marketplacePriceStockQueryKeys = queryKeysFactory(PRICE_STOCK_QUERY_KEY)

export const useMarketplacePriceStock = (
  query?: PriceStockQuery,
  options?: Omit<
    UseQueryOptions<PriceStockResponse, FetchError, PriceStockResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<PriceStockResponse>("/tenants/marketplaces/price-stock", {
        query: query as Record<string, unknown>,
      }),
    queryKey: marketplacePriceStockQueryKeys.list(query),
    ...options,
  })

  // Named fields rather than `...data`: react-query's own result carries a
  // `status`, and a response field of the same name would be shadowed by it
  // (the lesson `hooks/api/marketplaces.tsx` records).
  return {
    rows: data?.rows,
    counts: data?.counts,
    summary: data?.summary,
    thresholds: data?.thresholds,
    marketplaces: data?.marketplaces,
    marketplaceLabels: data?.marketplace_labels,
    sources: data?.sources,
    stored: data?.stored,
    asOf: data?.as_of,
    ...rest,
  }
}

/**
 * The warehouses and sizes of ONE article, fetched when the owner expands the
 * row. The list route carries the line COUNT of every column, so nothing is
 * hidden by this being a second request — the stand holds 11 819 `mp_offer`
 * lines and shipping them all with the table would be megabytes of JSON for a
 * screen that expands one row at a time.
 */
export const useMarketplacePriceStockLines = (
  vendorCode: string | null,
  options?: Omit<
    UseQueryOptions<PriceStockLinesResponse, FetchError, PriceStockLinesResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<PriceStockLinesResponse>("/tenants/marketplaces/price-stock/lines", {
        query: { vendor_code: vendorCode as string },
      }),
    queryKey: marketplacePriceStockQueryKeys.detail(vendorCode ?? "—"),
    enabled: Boolean(vendorCode),
    ...options,
  })

  return { lines: data, ...rest }
}

/** The export path, with the SAME query string the table was built from. */
export const marketplacePriceStockExportPath = (query: PriceStockQuery): string => {
  const params = new URLSearchParams()
  if (query.price_pct !== undefined) {
    params.set("price_pct", String(query.price_pct))
  }
  if (query.stock_abs !== undefined) {
    params.set("stock_abs", String(query.stock_abs))
  }
  if (query.tab) {
    params.set("tab", query.tab)
  }
  const search = params.toString()
  return `/tenants/marketplaces/price-stock/export${search ? `?${search}` : ""}`
}
