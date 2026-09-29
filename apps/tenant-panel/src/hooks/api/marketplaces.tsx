import { FetchError } from "@medusajs/js-sdk"
import {
  QueryKey,
  UseMutationOptions,
  UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query"

import { sdk } from "../../lib/client"
import { queryClient } from "../../lib/query-client"
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

/**
 * One field of the connect form, declared by the adapter
 * (w24-integration-keys-self-service). The panel renders whatever the backend
 * sends, so a third marketplace gets a form with nothing added here.
 */
export type MarketplaceKeyField = {
  name: string
  label: string
  secret: boolean
  hint: string
  doc_url: string
  /** The stored value of a non-secret field (Ozon's Client-Id). `null` for a secret. */
  value: string | null
  /** `{ set, last4 }` of a secret field. The value itself never crosses the wire. */
  masked: { set: boolean; last4: string | null } | null
}

export type MarketplaceCard = {
  id: string
  label: string
  connection: {
    key: {
      set: boolean
      last4: string | null
      /**
       * A key is stored but the server cannot decrypt it (46df D1). `set` is
       * `false` then: nothing usable is stored, and the owner enters it again.
       */
      unreadable: boolean
      /** One line from the adapter: how this shop's key gets stored. */
      how_to_store: string
    }
    is_enabled: boolean
    fields: MarketplaceKeyField[]
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

/**
 * The state `PUT`/`DELETE /tenants/marketplaces/:id/key` answer with: the same
 * read-back the card shows, so the screen never restates its own request as a
 * result (rule 20a).
 */
export type MarketplaceKeyResponse = {
  marketplace: string
  label: string
  connection: {
    key: { set: boolean; last4: string | null; unreadable: boolean }
    is_enabled: boolean
    how_to_store: string
  }
  fields: MarketplaceKeyField[]
  credentials: MarketplaceCredentials | null
}

/** One string per declared field. A secret left out keeps its stored value. */
export type PutMarketplaceKeyBody = Record<string, string>

/**
 * The owner stores her own key (w24-integration-keys-self-service, Ivan's
 * order of 2026-09-16 11:37 WITA).
 *
 * Both mutations invalidate the whole marketplaces key: the card's own status
 * query has to ask the key what it may do AGAIN, and the list route carries
 * `{ set, last4 }` too. Invalidating only the detail would leave the hub
 * showing «ключ не сохранён» next to a card that just saved one.
 */
export const useSaveMarketplaceKey = (
  marketplace: string,
  options?: UseMutationOptions<MarketplaceKeyResponse, FetchError, PutMarketplaceKeyBody>
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<MarketplaceKeyResponse>(`/tenants/marketplaces/${marketplace}/key`, {
        method: "PUT",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: marketplacesQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useDeleteMarketplaceKey = (
  marketplace: string,
  options?: UseMutationOptions<MarketplaceKeyResponse, FetchError, void>
) => {
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<MarketplaceKeyResponse>(`/tenants/marketplaces/${marketplace}/key`, {
        method: "DELETE",
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: marketplacesQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
