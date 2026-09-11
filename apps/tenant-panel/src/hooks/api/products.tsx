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
import { productOptionsQueryKeys } from "./product-options"

// tenant-panel: tenant equivalent of the Admin's hooks/api/products.tsx,
// trimmed to what the panel's copied product screens need
// (docs/tenant-panel/api-contract.md). Every hook here is the Admin's own hook
// with `sdk.admin.product.*` replaced by an `sdk.client.fetch` against the
// matching `/tenants/products/*` route: the js-sdk's admin module hardcodes
// `/admin/...`, so the URL is the one thing that cannot be reused. Query keys,
// invalidation and the `fields` each mutation asks back are the Admin's,
// because the copied screens read the cache through the same keys.
//
// Still dropped, because the tenant contract has no route for them: product
// export, import and the cross-product `POST /admin/products/batch`.

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

export const useUpdateProduct = (
  id: string,
  options?: UseMutationOptions<
    HttpTypes.AdminProductResponse,
    FetchError,
    HttpTypes.AdminUpdateProduct
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<HttpTypes.AdminProductResponse>(
        `/tenants/products/${id}`,
        {
          method: "POST",
          body: payload,
          query: {
            fields:
              "-type,-collection,-options,-tags,-images,-variants,-sales_channels",
          },
        }
      ),
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({
        queryKey: productsQueryKeys.lists(),
      })
      await queryClient.invalidateQueries({
        queryKey: productsQueryKeys.detail(id),
      })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useProductVariant = (
  productId: string,
  variantId: string,
  query?: HttpTypes.AdminProductVariantParams,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminProductVariantResponse,
      FetchError,
      HttpTypes.AdminProductVariantResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<HttpTypes.AdminProductVariantResponse>(
        `/tenants/products/${productId}/variants/${variantId}`,
        { query: query as Record<string, unknown> }
      ),
    queryKey: variantsQueryKeys.detail(variantId, query),
    ...options,
  })

  return { ...data, ...rest }
}

export const useProductVariants = (
  productId: string,
  query?: HttpTypes.AdminProductVariantParams,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminProductVariantListResponse,
      FetchError,
      HttpTypes.AdminProductVariantListResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<HttpTypes.AdminProductVariantListResponse>(
        `/tenants/products/${productId}/variants`,
        { query: query as Record<string, unknown> }
      ),
    queryKey: variantsQueryKeys.list({ productId, ...query }),
    ...options,
  })

  return { ...data, ...rest }
}

export const useCreateProductVariant = (
  productId: string,
  options?: UseMutationOptions<any, FetchError, any>
) => {
  return useMutation({
    mutationFn: (payload: HttpTypes.AdminCreateProductVariant) =>
      sdk.client.fetch<HttpTypes.AdminProductResponse>(
        `/tenants/products/${productId}/variants`,
        { method: "POST", body: payload, query: { fields: "id" } }
      ),
    onSuccess: (data: any, variables: any, context: any) => {
      queryClient.invalidateQueries({ queryKey: variantsQueryKeys.lists() })
      queryClient.invalidateQueries({
        queryKey: productsQueryKeys.detail(productId),
      })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useUpdateProductVariant = (
  productId: string,
  variantId: string,
  options?: UseMutationOptions<any, FetchError, any>
) => {
  return useMutation({
    mutationFn: (payload: HttpTypes.AdminUpdateProductVariant) =>
      sdk.client.fetch<HttpTypes.AdminProductResponse>(
        `/tenants/products/${productId}/variants/${variantId}`,
        { method: "POST", body: payload, query: { fields: "id" } }
      ),
    onSuccess: (data: any, variables: any, context: any) => {
      queryClient.invalidateQueries({ queryKey: variantsQueryKeys.lists() })
      queryClient.invalidateQueries({
        queryKey: variantsQueryKeys.detail(variantId),
      })
      queryClient.invalidateQueries({
        queryKey: productsQueryKeys.detail(productId),
      })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useUpdateProductVariantsBatch = (
  productId: string,
  options?: UseMutationOptions<any, FetchError, any>
) => {
  return useMutation({
    mutationFn: (payload: HttpTypes.AdminBatchProductVariantRequest["update"]) =>
      sdk.client.fetch<HttpTypes.AdminBatchProductVariantResponse>(
        `/tenants/products/${productId}/variants/batch`,
        { method: "POST", body: { update: payload } }
      ),
    onSuccess: (data: any, variables: any, context: any) => {
      queryClient.invalidateQueries({ queryKey: variantsQueryKeys.lists() })
      queryClient.invalidateQueries({ queryKey: variantsQueryKeys.details() })
      queryClient.invalidateQueries({
        queryKey: productsQueryKeys.detail(productId),
      })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useProductVariantsInventoryItemsBatch = (
  productId: string,
  options?: UseMutationOptions<
    HttpTypes.AdminBatchProductVariantInventoryItemResponse,
    FetchError,
    HttpTypes.AdminBatchProductVariantInventoryItemRequest
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<HttpTypes.AdminBatchProductVariantInventoryItemResponse>(
        `/tenants/products/${productId}/variants/inventory-items/batch`,
        { method: "POST", body: payload }
      ),
    onSuccess: (data: any, variables: any, context: any) => {
      queryClient.invalidateQueries({ queryKey: variantsQueryKeys.lists() })
      queryClient.invalidateQueries({ queryKey: variantsQueryKeys.details() })
      queryClient.invalidateQueries({
        queryKey: productsQueryKeys.detail(productId),
      })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useDeleteVariant = (
  productId: string,
  variantId: string,
  options?: UseMutationOptions<any, FetchError, void>
) => {
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<HttpTypes.AdminProductVariantDeleteResponse>(
        `/tenants/products/${productId}/variants/${variantId}`,
        { method: "DELETE", query: { fields: "id" } }
      ),
    onSuccess: (data: any, variables: any, context: any) => {
      queryClient.invalidateQueries({ queryKey: variantsQueryKeys.lists() })
      queryClient.invalidateQueries({
        queryKey: variantsQueryKeys.detail(variantId),
      })
      queryClient.invalidateQueries({
        queryKey: productsQueryKeys.detail(productId),
      })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useDeleteVariantLazy = (
  productId: string,
  options?: UseMutationOptions<
    HttpTypes.AdminProductVariantDeleteResponse,
    FetchError,
    { variantId: string }
  >
) => {
  return useMutation({
    mutationFn: ({ variantId }) =>
      sdk.client.fetch<HttpTypes.AdminProductVariantDeleteResponse>(
        `/tenants/products/${productId}/variants/${variantId}`,
        { method: "DELETE" }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: variantsQueryKeys.lists() })
      queryClient.invalidateQueries({
        queryKey: variantsQueryKeys.detail(variables.variantId),
      })
      queryClient.invalidateQueries({
        queryKey: productsQueryKeys.detail(productId),
      })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useBatchImageVariants = (
  productId: string,
  imageId: string,
  options?: UseMutationOptions<
    HttpTypes.AdminBatchImageVariantResponse,
    FetchError,
    HttpTypes.AdminBatchImageVariantRequest
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<HttpTypes.AdminBatchImageVariantResponse>(
        `/tenants/products/${productId}/images/${imageId}/variants/batch`,
        { method: "POST", body: payload }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({
        queryKey: productsQueryKeys.detail(productId),
      })
      queryClient.invalidateQueries({ queryKey: variantsQueryKeys.lists() })
      queryClient.invalidateQueries({ queryKey: variantsQueryKeys.details() })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useBatchVariantImages = (
  productId: string,
  variantId: string,
  options?: UseMutationOptions<
    HttpTypes.AdminBatchVariantImagesResponse,
    FetchError,
    HttpTypes.AdminBatchVariantImagesRequest
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<HttpTypes.AdminBatchVariantImagesResponse>(
        `/tenants/products/${productId}/variants/${variantId}/images/batch`,
        { method: "POST", body: payload }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({
        queryKey: productsQueryKeys.detail(productId),
      })
      queryClient.invalidateQueries({
        queryKey: variantsQueryKeys.list({ productId }),
      })
      queryClient.invalidateQueries({
        queryKey: variantsQueryKeys.detail(variantId),
      })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

// tenant-panel: the Admin keeps `useLinkProductOptions` in this module, and so
// does the panel. 2.19.0 manages a product's options through this one batch
// route; there are no `options/:option_id` routes to mirror.
export const useLinkProductOptions = (
  productId: string,
  options?: UseMutationOptions<
    HttpTypes.AdminProductResponse,
    FetchError,
    HttpTypes.AdminLinkProductOptions
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<HttpTypes.AdminProductResponse>(
        `/tenants/products/${productId}/options/batch`,
        { method: "POST", body: payload }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: productsQueryKeys.lists() })
      queryClient.invalidateQueries({
        queryKey: productsQueryKeys.detail(productId),
      })
      queryClient.invalidateQueries({ queryKey: productOptionsQueryKeys.all })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
