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

// tenant-panel: tenant equivalent of the Admin's hooks/api/products.tsx,
// trimmed to what the panel's copied product screens need
// (docs/tenant-panel/api-contract.md): list, retrieve, create and delete, all
// tenant-scoped through `/tenants/products`. `variantsQueryKeys` is exported
// (some copied product-detail widgets key off it even before this piece
// builds any variant hooks) but no variant hook is implemented here; that is
// the product-detail piece's job. Every other Admin mutation (update,
// export/import, variant batch ops, link-options) is dropped: the tenant
// contract has no matching route yet.

const PRODUCTS_QUERY_KEY = "products" as const
export const productsQueryKeys = queryKeysFactory(PRODUCTS_QUERY_KEY)

const VARIANTS_QUERY_KEY = "product_variants" as const
export const variantsQueryKeys = queryKeysFactory(VARIANTS_QUERY_KEY)

export const useProducts = (
  query?: HttpTypes.AdminProductListParams,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminProductListResponse,
      FetchError,
      HttpTypes.AdminProductListResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<HttpTypes.AdminProductListResponse>(
        "/tenants/products",
        { query }
      ),
    queryKey: productsQueryKeys.list(query),
    ...options,
  })

  return { ...data, ...rest }
}

export const useProduct = (
  id: string,
  query?: Record<string, any>,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminProductResponse,
      FetchError,
      HttpTypes.AdminProductResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<HttpTypes.AdminProductResponse>(
        `/tenants/products/${id}`,
        { query }
      ),
    queryKey: productsQueryKeys.detail(id, query),
    ...options,
  })

  return { ...data, ...rest }
}

export const useCreateProduct = (
  options?: UseMutationOptions<
    HttpTypes.AdminProductResponse,
    FetchError,
    HttpTypes.AdminCreateProduct
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<HttpTypes.AdminProductResponse>("/tenants/products", {
        method: "POST",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: productsQueryKeys.lists() })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useDeleteProduct = (
  id: string,
  options?: UseMutationOptions<
    HttpTypes.AdminProductDeleteResponse,
    FetchError,
    void
  >
) => {
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<HttpTypes.AdminProductDeleteResponse>(
        `/tenants/products/${id}`,
        { method: "DELETE" }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: productsQueryKeys.lists() })
      queryClient.invalidateQueries({ queryKey: productsQueryKeys.detail(id) })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
