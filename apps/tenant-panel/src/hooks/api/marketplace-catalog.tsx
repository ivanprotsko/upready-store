import { FetchError } from "@medusajs/js-sdk"
import {
  QueryKey,
  UseMutationOptions,
  UseQueryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// tenant-panel: own hooks, no Admin counterpart — the «Маркетплейсы → Каталог»
// screen of w14-mp-catalog-link.
//
// One row per ARTICLE: the shop's SKU and the marketplace's `vendorCode` /
// `offer_id` are the same string, which is why one line can carry the shop, the
// WB card and the Ozon card at once.
//
// The reads and the writes are separate on purpose. `GET .../catalog` writes
// nothing, so the «сопоставление не сработало: 0 из N» state stays reachable;
// the links are written by `POST .../catalog/auto-link` (the rule) and
// `POST .../catalog/links` (a person).

export type CatalogState =
  | "linked"
  | "needs_choice"
  | "not_found_in_shop"
  | "missing_on_marketplace"

/** Why a row with cards is not linked. See the backend module for the full note. */
export type NeedsChoiceReason = "ambiguous" | "not_linked_yet"

export type CatalogDifference = {
  metric: "price" | "stock" | "photos"
  shop: number | null
  marketplace: number | null
  unit: string
  abs: number | null
  pct: number | null
  highlighted: boolean
  /** One line saying where both numbers came from (rule 18e). */
  note: string
}

export type CatalogLink = {
  id: string
  marketplace: string
  external_id: string
  product_id: string
  variant_id: string | null
  matched_by: string
  linked_at: string | null
}

export type CatalogCardSide = {
  marketplace: string
  external_id: string
  title: string | null
  photos: number
  price: number | null
  price_basis: "discount_price" | "price" | null
  currency: string | null
  stock: number | null
  offers: number
  mp_updated_at: string | null
  link: CatalogLink | null
}

export type CatalogCandidate = {
  variant_id: string
  product_id: string
  product_title: string | null
  sku: string | null
}

/**
 * What `w07-tenant-catalog-enrich` recorded for this product: which card its
 * content came from, and when. `null` where the enrichment never ran.
 */
export type ShopEnrichment = {
  marketplace: string
  external_id: string
  matched_by: string
  linked_at: string | null
}

export type CatalogRow = {
  vendor_code: string
  state: CatalogState
  reason: NeedsChoiceReason | null
  shop: {
    variant_id: string
    product_id: string
    product_title: string | null
    sku: string | null
    price: number | null
    currency: string | null
    stock: number | null
    photos: number
    enriched: ShopEnrichment | null
  } | null
  candidates: CatalogCandidate[]
  cards: CatalogCardSide[]
  differences: CatalogDifference[]
}

export type CatalogCounts = {
  linked: number
  needs_choice: number
  not_found_in_shop: number
  missing_on_marketplace: number
  total: number
  accounted_for: number
}

export type CatalogThresholds = {
  price_pct: number
  stock_abs: number
  photos_abs: number
}

export type CatalogResponse = {
  rows: CatalogRow[]
  counts: CatalogCounts
  summary: string
  thresholds: CatalogThresholds
  sources: {
    matcher: string
    cards: string
    variants: string
    links: string
  }
  stored: {
    cards: number
    offers: number
    links: number
    variants: number
    /** Products the content enrichment (w07) has touched. */
    enriched: number
  }
}

export type AutoLinkResponse = {
  marketplaces: Array<{
    marketplace: string
    cards: number
    linked: number
    not_found: number
    needs_choice: number
    created: number
    updated: number
    removed: number
    kept_manual: number
    summary: string
  }>
  variants: number
}

const CATALOG_QUERY_KEY = "tenant-marketplace-catalog" as const
export const marketplaceCatalogQueryKeys = queryKeysFactory(CATALOG_QUERY_KEY)

export const useMarketplaceCatalog = (
  query?: Partial<CatalogThresholds>,
  options?: Omit<
    UseQueryOptions<CatalogResponse, FetchError, CatalogResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<CatalogResponse>("/tenants/marketplaces/catalog", {
        query: query as Record<string, unknown>,
      }),
    queryKey: marketplaceCatalogQueryKeys.list(query),
    ...options,
  })

  // Named fields rather than `...data`: react-query's own result carries a
  // `status`, and a response field of the same name would be shadowed by it
  // (the lesson `hooks/api/marketplaces.tsx` already records).
  return {
    rows: data?.rows,
    counts: data?.counts,
    summary: data?.summary,
    sources: data?.sources,
    stored: data?.stored,
    thresholds: data?.thresholds,
    ...rest,
  }
}

export const useAutoLinkMarketplaceCatalog = (
  options?: UseMutationOptions<AutoLinkResponse, FetchError, void>
) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<AutoLinkResponse>("/tenants/marketplaces/catalog/auto-link", {
        method: "POST",
      }),
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: marketplaceCatalogQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export type ManualLinkPayload = {
  marketplace: string
  external_id: string
  variant_id: string
}

export const useLinkMarketplaceCard = (
  options?: UseMutationOptions<{ link: CatalogLink }, FetchError, ManualLinkPayload>
) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: ManualLinkPayload) =>
      sdk.client.fetch<{ link: CatalogLink }>("/tenants/marketplaces/catalog/links", {
        method: "POST",
        body: payload,
      }),
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: marketplaceCatalogQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useUnlinkMarketplaceCard = (
  options?: UseMutationOptions<{ id: string }, FetchError, string>
) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      sdk.client.fetch<{ id: string }>(`/tenants/marketplaces/catalog/links/${id}`, {
        method: "DELETE",
      }),
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: marketplaceCatalogQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
