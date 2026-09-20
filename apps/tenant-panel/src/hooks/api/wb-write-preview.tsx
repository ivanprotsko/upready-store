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
// /tenants/wb/write-preview per w21-wb-write-stocks-prices.
//
// The GET is a read of two sides: the shop's own stock and prices, and the WB
// mirrors. The PUT changes one thing and it is NOT a mutation of Wildberries:
// which WB seller warehouse a stock location of the shop stands for. Sending
// anything to WB stays impossible from this panel — the gates live in the
// backend's write core and none of them is settable from here.

export type WbDiffKind = "stocks" | "prices"
export type WbDiffAction = "equal" | "update" | "skipped"

export type WbDiffRow = {
  kind: WbDiffKind
  product_id: string
  product_title: string
  variant_id: string
  variant_sku: string | null
  nm_id: string
  action: WbDiffAction
  reason: string | null
  store_value: number | null
  wb_value: number | null
  /** stocks only */
  barcode?: string | null
  chrt_id?: string | null
  warehouse_id?: string | null
  warehouse_name?: string | null
  /** prices only */
  currency?: string | null
  wb_price?: number | null
  wb_discount?: number | null
  proposed_price?: number | null
}

export type WbWarehouse = {
  warehouse_id: string
  warehouse_name: string | null
  lines: number
}

export type WbLocationMapping = {
  stock_location_id: string
  stock_location_name: string
  wb_warehouse_id: string | null
}

export type WbWritePreviewResponse = {
  kind: WbDiffKind
  counts: { total: number; equal: number; update: number; skipped: number }
  mirror_fetched_at: string | null
  push: { batches: number; rows: number; endpoints: string[] }
  gates: { live: { env_var: string; enabled: boolean } }
  warehouses: WbWarehouse[]
  unmapped_locations: WbLocationMapping[]
  locations: WbLocationMapping[]
  page: { limit: number; action: string; shown: number }
  rows: WbDiffRow[]
}

export type WbWritePreviewQuery = {
  kind: WbDiffKind
  action?: "all" | "equal" | "update" | "skipped"
  limit?: number
}

export type WbWritePreviewPayload = {
  warehouses: Array<{
    stock_location_id: string
    wb_warehouse_id: string | null
  }>
}

const WB_WRITE_PREVIEW_QUERY_KEY = "tenant-wb-write-preview" as const
export const wbWritePreviewQueryKeys = queryKeysFactory(
  WB_WRITE_PREVIEW_QUERY_KEY
)

export const useWbWritePreview = (
  query: WbWritePreviewQuery,
  options?: Omit<
    UseQueryOptions<
      WbWritePreviewResponse,
      FetchError,
      WbWritePreviewResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<WbWritePreviewResponse>("/tenants/wb/write-preview", {
        query: {
          kind: query.kind,
          action: query.action ?? "all",
          limit: query.limit ?? 100,
        },
      }),
    // The kind is part of the key: the stocks table and the prices table are
    // two different answers and must not overwrite each other in the cache.
    queryKey: wbWritePreviewQueryKeys.detail(
      `${query.kind}:${query.action ?? "all"}:${query.limit ?? 100}`
    ),
    ...options,
  })

  // Named `preview`, not `data`: same collision wb-status.tsx recorded for
  // `status`, avoided the same way.
  return { preview: data, ...rest }
}

export const useUpdateWbWarehouseMapping = (
  options?: UseMutationOptions<
    WbWritePreviewResponse,
    FetchError,
    WbWritePreviewPayload
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<WbWritePreviewResponse>("/tenants/wb/write-preview", {
        method: "PUT",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      // Every view of the diff changes when the mapping does, and the PUT
      // answers with only one of them, so the rest are invalidated rather
      // than written over with an answer that is not theirs (rule 20a).
      queryClient.invalidateQueries({ queryKey: wbWritePreviewQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
