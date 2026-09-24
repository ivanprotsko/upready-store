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

// tenant-panel: own hook, no Admin counterpart — GET /tenants/marketplaces/sync
// per w16-mp-scheduler-ops.
//
// One row per (marketplace, kind) for EVERY marketplace at once. The card
// screen answers "what is this marketplace"; this one answers "is the data
// fresh, and if not, why" — which means it has to be able to say NO: a kind
// that has never run, a failure whose text survives the next success, a key
// that expires in under 14 days.
//
// `status: null` means NEVER RAN and is not a zero (rule 20a). The screen
// renders the two differently and must keep doing so.

export type MarketplaceSyncKind = {
  kind: string
  /** `null` = the kind has never run. Not "0 rows". */
  status: string | null
  is_fixture: boolean | null
  started_at: string | null
  finished_at: string | null
  rows: number | null
  requests: number | null
  attempts: number | null
  error: string | null
  last_success_at: string | null
  last_success_rows: number | null
  /** The last failure survives later successes: an import failing every other hour is broken. */
  last_failure_at: string | null
  last_failure_error: string | null
  /** The window the marketplace itself named on a 429. Never estimated by us. */
  retry_at: string | null
  runs: number
  interval_ms: number | null
  next_at: string | null
  due: boolean
  due_reason: "never_ran" | "interval_elapsed" | "stale_lock_taken_over" | "locked" | "waiting"
}

export type MarketplaceSyncEntry = {
  id: string
  label: string
  connection: {
    key: { set: boolean; last4: string | null }
    is_enabled: boolean
  }
  credentials: {
    expires_at: string | null
    expired: boolean | null
    expires_in_days: number | null
    expiring_soon: boolean
    error: string | null
  }
  kinds: MarketplaceSyncKind[]
}

export type MarketplaceSyncWarning = {
  marketplace: string
  marketplace_label: string
  kind: string | null
  type: "no_key" | "key_expired" | "key_expiring" | "failed" | "never_ran"
  expires_at?: string | null
  expires_in_days?: number | null
  error?: string | null
  /**
   * The ready-made Russian sentence, for a consumer with no catalog of its own
   * (an alert, a digest). The SCREEN does not use it: it composes the sentence
   * from the fields above so the kind reads as «Карточки товаров» and not as
   * `cards`, in the locale the owner chose (rule 18e).
   */
  text: string
}

export type MarketplaceSyncResponse = {
  marketplaces: MarketplaceSyncEntry[]
  warnings: MarketplaceSyncWarning[]
  schedule: {
    cron: string
    stale_lock_ms: number
    expiry_warning_days: number
  }
  /** The server's clock, so «через сколько» is counted from it and not the browser's. */
  now: string
}

const MARKETPLACE_SYNC_QUERY_KEY = "tenant-marketplace-sync" as const
export const marketplaceSyncQueryKeys = queryKeysFactory(MARKETPLACE_SYNC_QUERY_KEY)

export const useMarketplaceSync = (
  options?: Omit<
    UseQueryOptions<MarketplaceSyncResponse, FetchError, MarketplaceSyncResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.client.fetch<MarketplaceSyncResponse>("/tenants/marketplaces/sync"),
    queryKey: marketplaceSyncQueryKeys.details(),
    ...options,
  })

  // Named, not spread: react-query's own result carries `status`, and a
  // response field of that name would be overwritten by it (measured on the
  // Wildberries card, 2026-09-16).
  return { sync: data, ...rest }
}

// «Обновить сейчас» — POST /tenants/marketplaces/sync (t-2026-09-24-n6, w6).
//
// Starts every connected marketplace's every kind for THIS tenant, ignoring
// how long is left of the normal interval. It does NOT bypass a marketplace's
// own rate-limit wait or a refused key: those kinds come back `skipped` with
// their reason, never silently dropped (rule 20a). The backend does not wait
// for the sync itself before answering, so this mutation resolves as soon as
// every kind has been told to start or told why it was not.

export type SyncNowOutcome = "started" | "skipped"

export type SyncNowResult = {
  marketplace: string
  /** `"*"` for a marketplace skipped whole (no key, integration off). */
  kind: string
  outcome: SyncNowOutcome
  /** `never_ran | forced | stale_lock_taken_over | locked | waiting | no_key | integration_disabled`. */
  reason: string
}

export type SyncNowResponse = {
  results: SyncNowResult[]
  now: string
}

export const useSyncMarketplacesNow = (
  options?: UseMutationOptions<SyncNowResponse, FetchError, void>
) => {
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<SyncNowResponse>("/tenants/marketplaces/sync", {
        method: "POST",
      }),
    onSuccess: (data, variables, context) => {
      // A kind that started writes a `running` row the instant this answers:
      // without this the table would keep showing the OLD status until the
      // next poll, and the screen would look like the click did nothing.
      queryClient.invalidateQueries({ queryKey: marketplaceSyncQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
