import { FetchError } from "@medusajs/js-sdk"
import { HttpTypes } from "@medusajs/types"
import { QueryKey, UseQueryOptions, useQuery } from "@tanstack/react-query"
import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// tenant-panel: tenant equivalent of the Admin's hooks/api/regions.tsx,
// read-only. `GET /tenants/regions` is a global reference list (not tenant-
// scoped, docs/tenant-panel/api-contract.md); `useRegion` and every mutation
// are dropped, nothing copied into the panel calls them.

const REGIONS_QUERY_KEY = "regions" as const
export const regionsQueryKeys = queryKeysFactory(REGIONS_QUERY_KEY)

export const useRegions = (
  query?: HttpTypes.AdminRegionFilters,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminRegionListResponse,
      FetchError,
      HttpTypes.AdminRegionListResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<HttpTypes.AdminRegionListResponse>(
        "/tenants/regions",
        { query }
      ),
    queryKey: regionsQueryKeys.list(query),
    ...options,
  })

  return { ...data, ...rest }
}
