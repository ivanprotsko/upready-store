import { FetchError } from "@medusajs/js-sdk"
import { HttpTypes } from "@medusajs/types"
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
import { variantsQueryKeys } from "./products"

// tenant-panel: tenant equivalent of the Admin's hooks/api/inventory.tsx,
// trimmed to the two things the copied product screens do with inventory: list
// the items the tenant's own variants use, and save the product-stock grid.
// The Admin's item create/update/delete, its export and its per-item location
// level hooks are dropped; the tenant contract has no routes for them and no
// copied screen calls them.

const INVENTORY_ITEMS_QUERY_KEY = "inventory_items" as const
export const inventoryItemsQueryKeys = queryKeysFactory(
  INVENTORY_ITEMS_QUERY_KEY
)

export const useInventoryItems = (
  query?: HttpTypes.AdminInventoryItemsParams,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminInventoryItemListResponse,
      FetchError,
      HttpTypes.AdminInventoryItemListResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<HttpTypes.AdminInventoryItemListResponse>(
        "/tenants/inventory-items",
        { query: query as Record<string, unknown> }
      ),
    queryKey: inventoryItemsQueryKeys.list(query),
    ...options,
  })

  return { ...data, ...rest }
}

export const useBatchInventoryItemsLocationLevels = (
  options?: UseMutationOptions<
    HttpTypes.AdminBatchInventoryItemsLocationLevelsResponse,
    FetchError,
    HttpTypes.AdminBatchInventoryItemsLocationLevels
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<HttpTypes.AdminBatchInventoryItemsLocationLevelsResponse>(
        "/tenants/inventory-items/location-levels/batch",
        { method: "POST", body: payload }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: inventoryItemsQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: variantsQueryKeys.lists() })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
