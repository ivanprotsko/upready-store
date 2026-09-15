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

// tenant-panel: own hook file, no Admin counterpart — GET/PUT
// /tenants/wb/write-settings per w20-wb-write-core.
//
// Unlike hooks/api/wb-status.tsx this one DOES have a mutation, but the two
// things it can change are the only two gates that are the owner's: the write
// switch and the per-class consents. The other three (a write credential, that
// credential being usable, and WB_WRITE_LIVE in the backend's environment) are
// reported by the same response and cannot be set from this panel at all.

export type WbWriteOpClass =
  | "stocks"
  | "prices"
  | "feedback_answers"
  | "fbs_orders"

export type WbWriteEndpoint = {
  id: string
  method: string
  host: string
  path: string
  summary: string
  doc_url: string
  irreversible: boolean
}

export type WbWriteClass = {
  op_class: WbWriteOpClass
  consent: {
    confirmed_by: string
    confirmed_at: string | null
    note: string | null
  } | null
  endpoints: WbWriteEndpoint[]
}

export type WbWriteAuditRow = {
  id: string
  op_class: string
  endpoint_id: string
  method: string
  path: string
  payload_sha256: string
  dry_run: boolean
  outcome: string
  gate: string | null
  actor: string
  status: number | null
  error: string | null
  created_at: string | null
}

export type WbWriteSettingsResponse = {
  marketplace: string
  gates: {
    credential: {
      slot: string
      key: { set: boolean; last4: string | null }
      is_enabled: boolean
      usable: boolean
      reason: string | null
    }
    live: { env_var: string; enabled: boolean }
  }
  is_enabled: boolean
  updated_by: string | null
  classes: WbWriteClass[]
  audit: WbWriteAuditRow[]
}

export type WbWriteSettingsPayload = {
  is_enabled?: boolean
  consents?: Array<{
    op_class: WbWriteOpClass
    granted: boolean
    note?: string
  }>
}

const WB_WRITE_SETTINGS_QUERY_KEY = "tenant-wb-write-settings" as const
export const wbWriteSettingsQueryKeys = queryKeysFactory(
  WB_WRITE_SETTINGS_QUERY_KEY
)

export const useWbWriteSettings = (
  options?: Omit<
    UseQueryOptions<
      WbWriteSettingsResponse,
      FetchError,
      WbWriteSettingsResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<WbWriteSettingsResponse>("/tenants/wb/write-settings"),
    queryKey: wbWriteSettingsQueryKeys.details(),
    ...options,
  })

  // Named `writeSettings`, not `settings`: same trap wb-status.tsx recorded —
  // react-query's own result carries `status`, and a generic name spread after
  // `...rest` is how that collision happens.
  return { writeSettings: data, ...rest }
}

export const useUpdateWbWriteSettings = (
  options?: UseMutationOptions<
    WbWriteSettingsResponse,
    FetchError,
    WbWriteSettingsPayload
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<WbWriteSettingsResponse>("/tenants/wb/write-settings", {
        method: "PUT",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      // The PUT answers with the whole state, so the cache is SET from the
      // response rather than refetched: what the screen shows next is what the
      // server read back, not what we asked for (rule 20a).
      queryClient.setQueryData(wbWriteSettingsQueryKeys.details(), data)
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
