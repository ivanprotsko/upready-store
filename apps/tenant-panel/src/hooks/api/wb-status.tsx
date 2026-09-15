import { FetchError } from "@medusajs/js-sdk"
import { QueryKey, UseQueryOptions, useQuery } from "@tanstack/react-query"

import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// tenant-panel: own hook, no Admin counterpart — GET /tenants/wb/status per
// w01-wb-readonly-client. Read-only on purpose: the screen shows the
// connection and there is no mutation to pair with it, because the import is a
// script and this client cannot write to Wildberries at all.

export type WbTokenBit = { bit: number; meaning: string | null }

export type WbTokenCategory = { bit: number; name: string; granted: boolean }

export type WbStatusResponse = {
  connection: {
    key: { set: boolean; last4: string | null }
    is_enabled: boolean
  }
  token: {
    token_id: string | null
    seller_id: string | null
    kind: string | null
    sandbox: boolean | null
    expires_at: string | null
    expired: boolean
    /** Whole days until expiry; negative once expired, null if unreadable. */
    expires_in_days: number | null
    /** true when not yet expired and due within the warning window (w13-wb-readonly-flag). */
    expiring_soon: boolean
    mask: number | null
    bits: WbTokenBit[]
    /** Every documented category, granted and denied (w13-wb-readonly-flag). */
    categories: WbTokenCategory[]
    /** true, false, or "unknown" — never true because somebody remembered. */
    read_only: boolean | "unknown"
    read_only_source: string
    doc_url: string
    error: string | null
  }
  endpoints: Array<{
    id: string
    method: "GET" | "POST"
    host: string
    path: string
    summary: string
    doc_url: string
    read_via_post: string | null
  }>
  sync: Array<{
    kind: string
    status: string | null
    started_at: string | null
    finished_at: string | null
    rows: number | null
    requests: number | null
    error: string | null
    retry_at: string | null
  }>
  mirrors: Record<string, number>
}

const WB_STATUS_QUERY_KEY = "tenant-wb-status" as const
export const wbStatusQueryKeys = queryKeysFactory(WB_STATUS_QUERY_KEY)

export const useWbStatus = (
  options?: Omit<
    UseQueryOptions<WbStatusResponse, FetchError, WbStatusResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.client.fetch<WbStatusResponse>("/tenants/wb/status"),
    queryKey: wbStatusQueryKeys.details(),
    ...options,
  })

  // Named `wb`, not `status`: react-query's own result carries a `status`
  // field ("pending" | "error" | "success"), and `...rest` after it would
  // overwrite the response with that string. Measured on the stand
  // 2026-09-16: the card rendered and threw
  // `Cannot read properties of undefined (reading 'key')`, because `status`
  // was the string "success" by the time the component read it.
  return { wb: data, ...rest }
}
