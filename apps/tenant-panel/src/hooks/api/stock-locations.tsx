import { FetchError } from "@medusajs/js-sdk"
import { HttpTypes } from "@medusajs/types"
import { QueryKey, UseQueryOptions, useQuery } from "@tanstack/react-query"
import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// tenant-panel: read-only half of the Admin's hooks/api/stock-locations.tsx.
// `GET /tenants/stock-locations` re-exports the Admin's own handler behind the
// tenant authentication; the location names label the product-stock grid. The
// Admin's create/update/delete and fulfillment-set hooks are dropped: stock
// locations are installation-wide configuration a tenant does not administer.

const STOCK_LOCATIONS_QUERY_KEY = "stock_locations" as const
export const stockLocationsQueryKeys = queryKeysFactory(
  STOCK_LOCATIONS_QUERY_KEY
)

export const useStockLocations = (
  query?: HttpTypes.AdminStockLocationListParams,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminStockLocationListResponse,
      FetchError,
      HttpTypes.AdminStockLocationListResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<HttpTypes.AdminStockLocationListResponse>(
        "/tenants/stock-locations",
        { query: query as Record<string, unknown> }
      ),
    queryKey: stockLocationsQueryKeys.list(query),
    ...options,
  })

  return { ...data, ...rest }
}
