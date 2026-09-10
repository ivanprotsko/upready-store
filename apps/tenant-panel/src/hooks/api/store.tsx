import { FetchError } from "@medusajs/js-sdk"
import { HttpTypes } from "@medusajs/types"
import { QueryKey, UseQueryOptions, useQuery } from "@tanstack/react-query"
import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// tenant-panel: tenant equivalent of the Admin's hooks/api/store.tsx. The
// Admin resolves the store through `GET /admin/stores` (there is only ever
// one) and picks `stores[0]`. The tenant contract exposes a single
// `GET /tenants/store` that already returns the tenant-scoped row (its `name`
// replaced by the tenant's own name, `default_sales_channel_id` set to the
// tenant's channel), so no list-and-pick step is needed here. Mutations
// (`useUpdateStore`) are dropped: the tenant API has no write route for the
// store, and nothing copied into the panel calls it.

const STORE_QUERY_KEY = "store" as const
export const storeQueryKeys = queryKeysFactory(STORE_QUERY_KEY)

export const useStore = (
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminStoreResponse,
      FetchError,
      HttpTypes.AdminStoreResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<HttpTypes.AdminStoreResponse>("/tenants/store"),
    queryKey: storeQueryKeys.details(),
    ...options,
  })

  return { ...data, ...rest }
}
