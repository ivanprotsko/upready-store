import { FetchError } from "@medusajs/js-sdk"
import { QueryKey, UseQueryOptions, useQuery } from "@tanstack/react-query"

import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// tenant-panel: own hooks, no Admin counterpart — GET /tenants/marketplaces and
// GET /tenants/marketplaces/:marketplace/status per w12-marketplace-core.
//
// Read-only on purpose, like the Wildberries page before it: the imports are
// scripts, and no adapter in this repository can send a marketplace anything
// but a registered read.
//
// The LIST does not ask the keys what they may do — on Ozon that is a network
// request per card. The per-marketplace query does, which is why a card shows
// «спрашиваем ключ…» while it is in flight and never «не спрошено», a claim
// that would be false one second later (rule 19h: an unanswered question is a
// third state, not a `false`).

export type MarketplaceScope = { name: string; granted: boolean }

export type MarketplaceCredentials = {
  expires_at: string | null
  expired: boolean | null
  expires_in_days: number | null
  expiring_soon: boolean
  /** true, false, or "unknown" — never true because somebody remembered. */
  read_only: boolean | "unknown"
  read_only_source: string | null
  scopes: MarketplaceScope[]
  raw: Record<string, unknown>
  error: string | null
}

export type MarketplaceCard = {
  id: string
  label: string
  connection: {
    key: {
      set: boolean
      last4: string | null
      /** One line from the adapter: how this shop's key gets stored. */
      how_to_store: string
    }
    is_enabled: boolean
  }
  /** `null` on the list route: not asked, rather than asked and unknown. */
  credentials: MarketplaceCredentials | null
  endpoints: Array<{
    id: string
    method: "GET" | "POST"
    host: string
    path: string
    summary: string
    doc_url: string
    read_via_post: string | null
  }>
  denied: Array<{ method: string; path: string; summary: string; doc_url: string }>
  sync: Array<{
    kind: string
    status: string | null
    is_fixture: boolean | null
    started_at: string | null
    finished_at: string | null
    rows: number | null
    requests: number | null
    error: string | null
  }>
  normalized: Record<string, number>
  kinds: readonly string[]
  linking: {
    total: number
    linked: number
    not_found: number
    needs_choice: number
    accounted_for: number
    /** What `mp_link` holds today, next to what the matcher says now. */
    stored: number
    summary: string
    needs_choice_cards: Array<{
      external_id: string
      vendor_code: string
      variant_ids: string[]
    }>
  }
}

export type MarketplacesResponse = {
  marketplaces: MarketplaceCard[]
  count: number
}

const MARKETPLACES_QUERY_KEY = "tenant-marketplaces" as const
export const marketplacesQueryKeys = queryKeysFactory(MARKETPLACES_QUERY_KEY)

export const useMarketplaces = (
  options?: Omit<
    UseQueryOptions<MarketplacesResponse, FetchError, MarketplacesResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.client.fetch<MarketplacesResponse>("/tenants/marketplaces"),
    queryKey: marketplacesQueryKeys.details(),
    ...options,
  })

  // Named `marketplaces`, not `data` spread over `...rest`: react-query's own
  // result carries a `status` field, and a response field of the same name
  // would be overwritten by it (measured on the Wildberries card, 2026-09-16).
  return { marketplaces: data?.marketplaces, count: data?.count, ...rest }
}

export const useMarketplaceStatus = (
  marketplace: string,
  options?: Omit<
    UseQueryOptions<MarketplaceCard, FetchError, MarketplaceCard, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<MarketplaceCard>(`/tenants/marketplaces/${marketplace}/status`),
    queryKey: marketplacesQueryKeys.detail(marketplace),
    ...options,
  })

  return { card: data, ...rest }
}
