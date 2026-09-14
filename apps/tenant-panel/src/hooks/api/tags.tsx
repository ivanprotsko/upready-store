import { FetchError } from "@medusajs/js-sdk"
import { HttpTypes } from "@medusajs/types"
import { QueryKey, UseQueryOptions, useQuery } from "@tanstack/react-query"
import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// tenant-panel: tenant equivalent of the Admin's hooks/api/tags.tsx,
// read-only. `GET /tenants/product-tags` is a global reference list
// (docs/tenant-panel/api-contract.md). `useProductTag`,
// `useInfiniteProductTags` and every mutation are dropped.

const TAGS_QUERY_KEY = "tags" as const
export const productTagsQueryKeys = queryKeysFactory(TAGS_QUERY_KEY)

export const useProductTags = (
  query?: HttpTypes.AdminProductTagListParams,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminProductTagListResponse,
      FetchError,
      HttpTypes.AdminProductTagListResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: async () =>
      sdk.client.fetch<HttpTypes.AdminProductTagListResponse>(
        "/tenants/product-tags",
        { query }
      ),
    queryKey: productTagsQueryKeys.list(query),
    ...options,
  })

  return { ...data, ...rest }
}
