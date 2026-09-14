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
import { productsQueryKeys } from "./products"

// tenant-panel: the Admin's own hooks/api/categories.tsx, with every
// `sdk.admin.productCategory.*` call replaced by an `sdk.client.fetch` against
// the matching `/tenants/product-categories` route (the js-sdk's admin module
// hardcodes `/admin/...`, so the URL is the one thing that cannot be reused).
// Query keys and the invalidation sets are the Admin's, because the copied
// category screens read the cache through the same keys.
//
// `GET /tenants/product-categories` is no longer the global catalog tree it was
// in wave 1: it now lists only the categories linked to the tenant
// (docs/tenant-panel/api-contract.md, wave-2 piece 5). The product-create and
// product-organization category combobox reads this same hook, so it now offers
// the tenant's own categories only, which is the intended behaviour.
//
// Dropped: `useInfiniteCategories`. Nothing in the copied screens calls it (the
// category combobox uses the plain list with `enabled: open`), and keeping it
// would be an untested second read path.
const CATEGORIES_QUERY_KEY = "categories" as const
export const categoriesQueryKeys = queryKeysFactory(CATEGORIES_QUERY_KEY)

export const useProductCategory = (
  id: string,
  query?: HttpTypes.AdminProductCategoryParams,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminProductCategoryResponse,
      FetchError,
      HttpTypes.AdminProductCategoryResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: categoriesQueryKeys.detail(id, query),
    queryFn: () =>
      sdk.client.fetch<HttpTypes.AdminProductCategoryResponse>(
        `/tenants/product-categories/${id}`,
        { query }
      ),
    ...options,
  })

  return { ...data, ...rest }
}

export const useProductCategories = (
  query?: HttpTypes.AdminProductCategoryListParams,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminProductCategoryListResponse,
      FetchError,
      HttpTypes.AdminProductCategoryListResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: categoriesQueryKeys.list(query),
    queryFn: () =>
      sdk.client.fetch<HttpTypes.AdminProductCategoryListResponse>(
        "/tenants/product-categories",
        { query }
      ),
    ...options,
  })

  return { ...data, ...rest }
}

export const useCreateProductCategory = (
  options?: UseMutationOptions<
    HttpTypes.AdminProductCategoryResponse,
    FetchError,
    HttpTypes.AdminCreateProductCategory
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<HttpTypes.AdminProductCategoryResponse>(
        "/tenants/product-categories",
        { method: "POST", body: payload }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: categoriesQueryKeys.lists() })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useUpdateProductCategory = (
  id: string,
  options?: UseMutationOptions<
    HttpTypes.AdminProductCategoryResponse,
    FetchError,
    HttpTypes.AdminUpdateProductCategory
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<HttpTypes.AdminProductCategoryResponse>(
        `/tenants/product-categories/${id}`,
        { method: "POST", body: payload }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: categoriesQueryKeys.lists() })
      queryClient.invalidateQueries({
        queryKey: categoriesQueryKeys.detail(id),
      })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useDeleteProductCategory = (
  id: string,
  options?: UseMutationOptions<
    HttpTypes.AdminProductCategoryDeleteResponse,
    FetchError,
    void
  >
) => {
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<HttpTypes.AdminProductCategoryDeleteResponse>(
        `/tenants/product-categories/${id}`,
        { method: "DELETE" }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({
        queryKey: categoriesQueryKeys.detail(id),
      })
      queryClient.invalidateQueries({ queryKey: categoriesQueryKeys.lists() })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useUpdateProductCategoryProducts = (
  id: string,
  options?: UseMutationOptions<
    HttpTypes.AdminProductCategoryResponse,
    FetchError,
    HttpTypes.AdminUpdateProductCategoryProducts
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<HttpTypes.AdminProductCategoryResponse>(
        `/tenants/product-categories/${id}/products`,
        { method: "POST", body: payload }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: categoriesQueryKeys.lists() })
      queryClient.invalidateQueries({
        queryKey: categoriesQueryKeys.details(),
      })
      /**
       * Invalidate products list query to ensure that the products collections are updated.
       */
      queryClient.invalidateQueries({
        queryKey: productsQueryKeys.lists(),
      })

      queryClient.invalidateQueries({
        queryKey: productsQueryKeys.details(),
      })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
