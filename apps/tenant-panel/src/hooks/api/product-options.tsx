import { FetchError } from "@medusajs/js-sdk"
import { HttpTypes } from "@medusajs/types"
import { QueryKey, UseQueryOptions, useQuery } from "@tanstack/react-query"
import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// tenant-panel: tenant equivalent of the Admin's hooks/api/product-options.tsx,
// trimmed to the one list hook the copied product-create form needs.
// `GET /tenants/product-options` lists options of the tenant's own products
// (docs/tenant-panel/api-contract.md). `useProductOption`,
// `useProductOptionValue(s)` and every mutation are dropped.

const PRODUCT_OPTIONS_QUERY_KEY = "product_options" as const
export const productOptionsQueryKeys = queryKeysFactory(
  PRODUCT_OPTIONS_QUERY_KEY
)

export const useProductOptions = (
  query?: HttpTypes.AdminProductOptionListParams,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminProductOptionListResponse,
      FetchError,
      HttpTypes.AdminProductOptionListResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<HttpTypes.AdminProductOptionListResponse>(
        "/tenants/product-options",
        { query }
      ),
    queryKey: productOptionsQueryKeys.list(query),
    ...options,
  })

  return { ...data, ...rest }
}
