import { FetchError } from "@medusajs/js-sdk"
import { HttpTypes } from "@medusajs/types"
import { QueryKey, UseQueryOptions, useQuery } from "@tanstack/react-query"
import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// tenant-panel: tenant equivalent of the Admin's hooks/api/collections.tsx,
// read-only. `GET /tenants/collections` is a global reference list
// (docs/tenant-panel/api-contract.md). `useCollection`,
// `useInfiniteCollections` and every mutation are dropped.

const COLLECTION_QUERY_KEY = "collections" as const
export const collectionsQueryKeys = queryKeysFactory(COLLECTION_QUERY_KEY)

export const useCollections = (
  query?: HttpTypes.AdminCollectionListParams,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminCollectionListResponse,
      FetchError,
      HttpTypes.AdminCollectionListResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: async () =>
      sdk.client.fetch<HttpTypes.AdminCollectionListResponse>(
        "/tenants/collections",
        { query }
      ),
    queryKey: collectionsQueryKeys.list(query),
    ...options,
  })

  return { ...data, ...rest }
}
