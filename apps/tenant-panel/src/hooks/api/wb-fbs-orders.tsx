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
import { wbWriteSettingsQueryKeys } from "./wb-write-settings"

// tenant-panel: own hook file, no Admin counterpart — GET /tenants/wb/fbs-orders
// and POST /tenants/wb/fbs-orders/actions per w23-wb-write-fbs-orders.
//
// The GET reads OUR mirror and never Wildberries, so the desk can be reloaded
// without spending the shop's 300-requests-a-minute budget. The POST is the
// only mutation this panel can express, and today every answer it can produce
// is a dry run: three of the five gates are shut in every deployment.

export type WbFbsOrder = {
  order_id: string
  rid: string | null
  supply_id: string | null
  supplier_status: string | null
  wb_status: string | null
  is_cancellable: boolean | null
  nm_id: string | null
  article: string | null
  price_rub: number | null
  currency_code: string | null
  delivery_type: string | null
  warehouse_id: string | null
  created_at: string | null
  status_fetched_at: string | null
  /** `null` means the action is available; a string is the reason it is not. */
  assemble_refusal: string | null
  cancel_refusal: string | null
}

export type WbFbsSupply = {
  supply_id: string
  name: string | null
  done: boolean
  cargo_type: number | null
  orders: number
  created_at: string | null
  closed_at: string | null
}

export type WbFbsSyncRow = {
  kind: string
  status: string | null
  rows: number
  requests: number
  started_at: string | null
  finished_at: string | null
  error: string | null
}

export type WbFbsDeskResponse = {
  marketplace: string
  filter: string
  filters: string[]
  orders: WbFbsOrder[]
  supplies: WbFbsSupply[]
  counts: Record<string, number>
  sync: WbFbsSyncRow[]
  write: {
    op_class: string
    endpoints: Array<{
      id: string
      method: string
      host: string
      path: string
      summary: string
      doc_url: string
      irreversible: boolean
    }>
    gates: {
      credential: { usable: boolean; reason: string | null }
      enabled: boolean
      consent: { confirmed_by: string; confirmed_at: string | null } | null
      live: { env_var: string; enabled: boolean }
    }
  }
}

export type WbFbsActionPayload = {
  action: "assemble" | "cancel" | "deliver"
  order_ids?: string[]
  supply_id?: string | null
  supply_name?: string
}

export type WbFbsActionStep = {
  endpoint_id: string
  op_class: string
  method: string | null
  path: string | null
  dry_run: boolean
  payload_sha256: string | null
  status: number | null
  refused: boolean
  gate: string | null
  message: string | null
}

export type WbFbsActionResponse = {
  action: string
  orders: string[]
  supply_id: string | null
  steps: WbFbsActionStep[]
  dry_run: boolean
  note: string | null
}

const WB_FBS_QUERY_KEY = "tenant-wb-fbs-orders" as const
export const wbFbsQueryKeys = queryKeysFactory(WB_FBS_QUERY_KEY)

export const useWbFbsOrders = (
  status: string,
  options?: Omit<
    UseQueryOptions<WbFbsDeskResponse, FetchError, WbFbsDeskResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<WbFbsDeskResponse>("/tenants/wb/fbs-orders", {
        query: { status },
      }),
    queryKey: wbFbsQueryKeys.detail(status),
    ...options,
  })

  // Named `desk`, not `data` or `status`: react-query's own result already
  // carries `status`, and a generic name spread after `...rest` is how that
  // collision happens (the trap wb-status.tsx recorded).
  return { desk: data, ...rest }
}

export const useWbFbsAction = (
  options?: UseMutationOptions<
    WbFbsActionResponse,
    FetchError,
    WbFbsActionPayload
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<WbFbsActionResponse>("/tenants/wb/fbs-orders/actions", {
        method: "POST",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      // The desk does not change today (nothing is sent), but the AUDIT does:
      // the attempt is a new row in the journal on the connection tab, and a
      // screen that showed the action and not its trace would be the half of
      // the claim nobody can check.
      queryClient.invalidateQueries({ queryKey: wbFbsQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: wbWriteSettingsQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
