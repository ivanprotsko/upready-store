import { FetchError } from "@medusajs/js-sdk"
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

// t15-product-attributes: the shop's own product characteristics. No Admin
// counterpart — the native Admin has weight, dimensions, material, country and
// HS code and nothing else — so this module is the panel's own, in the shape
// every other hooks/api module here has (queryKeysFactory + sdk.client.fetch +
// invalidation on success), the same way `articles.tsx` was.
//
// TWO SCREENS, TWO KEYS. The schema (`/tenants/product-attributes`) is what the
// owner declares once; the values (`/tenants/products/:id/attributes`) are what
// each product carries. Editing the schema invalidates both, because removing a
// choice removes the values that used it.

export type ProductAttributeType = "text" | "number" | "select" | "boolean"

export type ProductAttributeOption = {
  id: string
  value: string
  label: string
  position: number
  translations: Record<string, string>
}

export type ProductAttribute = {
  id: string
  key: string
  name: string
  type: ProductAttributeType
  unit: string | null
  position: number
  category_id: string | null
  show_on_product: boolean
  use_as_filter: boolean
  options: ProductAttributeOption[]
  translations: Record<string, string>
}

/** One characteristic as the product screen sees it: the schema plus this product's value. */
export type ProductAttributeWithValue = ProductAttribute & {
  value: string | number | boolean | null
}

export type ProductAttributeListResponse = {
  product_attributes: ProductAttribute[]
  count: number
}

export type ProductAttributeResponse = {
  product_attribute: ProductAttribute
  cleared_values?: number
}

export type ProductAttributeValuesResponse = {
  product_attributes: ProductAttributeWithValue[]
  count: number
}

export type ProductAttributeOptionBody = {
  value: string
  label: string
  translations?: Record<string, string>
}

export type ProductAttributeBody = {
  name: string
  translations?: Record<string, string>
  type: ProductAttributeType
  unit?: string | null
  position?: number
  category_id?: string | null
  show_on_product?: boolean
  use_as_filter?: boolean
  options?: ProductAttributeOptionBody[]
}

export type CreateProductAttributeBody = ProductAttributeBody & { key: string }

export type ProductAttributeValuesBody = {
  values: { key: string; value: string | number | boolean | null }[]
}

const PRODUCT_ATTRIBUTES_QUERY_KEY = "tenant-product-attributes" as const
export const productAttributesQueryKeys = queryKeysFactory(PRODUCT_ATTRIBUTES_QUERY_KEY)

const PRODUCT_ATTRIBUTE_VALUES_QUERY_KEY = "tenant-product-attribute-values" as const
export const productAttributeValuesQueryKeys = queryKeysFactory(
  PRODUCT_ATTRIBUTE_VALUES_QUERY_KEY
)

const invalidateAll = () => {
  queryClient.invalidateQueries({ queryKey: productAttributesQueryKeys.all })
  queryClient.invalidateQueries({ queryKey: productAttributeValuesQueryKeys.all })
}

export const useProductAttributes = (
  options?: Omit<
    UseQueryOptions<
      ProductAttributeListResponse,
      FetchError,
      ProductAttributeListResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<ProductAttributeListResponse>("/tenants/product-attributes"),
    queryKey: productAttributesQueryKeys.lists(),
    ...options,
  })

  return { ...data, ...rest }
}

export const useProductAttribute = (
  id: string,
  options?: Omit<
    UseQueryOptions<ProductAttributeResponse, FetchError, ProductAttributeResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<ProductAttributeResponse>(`/tenants/product-attributes/${id}`),
    queryKey: productAttributesQueryKeys.detail(id),
    ...options,
  })

  return { ...data, ...rest }
}

export const useCreateProductAttribute = (
  options?: UseMutationOptions<
    ProductAttributeResponse,
    FetchError,
    CreateProductAttributeBody
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<ProductAttributeResponse>("/tenants/product-attributes", {
        method: "POST",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      invalidateAll()
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useUpdateProductAttribute = (
  id: string,
  options?: UseMutationOptions<ProductAttributeResponse, FetchError, ProductAttributeBody>
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<ProductAttributeResponse>(`/tenants/product-attributes/${id}`, {
        method: "POST",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      invalidateAll()
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useDeleteProductAttribute = (
  id: string,
  options?: UseMutationOptions<
    { id: string; object: string; deleted: boolean },
    FetchError,
    void
  >
) => {
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<{ id: string; object: string; deleted: boolean }>(
        `/tenants/product-attributes/${id}`,
        { method: "DELETE" }
      ),
    onSuccess: (data, variables, context) => {
      invalidateAll()
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

// b04-product-attributes: the starting set of characteristics, and how much of
// the catalog carries values. Both are the panel's own endpoints
// (`/tenants/product-attribute-presets`, `/tenants/product-attribute-coverage`)
// and both invalidate through the two keys above, because applying the preset
// creates characteristics and filling a product creates values.

export type ProductAttributePresetEntry = {
  key: string
  name: string
  type: ProductAttributeType
  unit: string | null
  use_as_filter: boolean
  exists: boolean
}

export type ProductAttributePresetResponse = {
  preset: ProductAttributePresetEntry[]
  missing: number
}

export type ApplyProductAttributePresetResponse = {
  created: string[]
  existing: string[]
  product_attributes: ProductAttribute[]
}

export type ProductAttributeCoverageResponse = {
  products_total: number
  products_filled: number
  attributes_total: number
  per_attribute: Record<string, number>
}

export const useProductAttributePreset = (
  options?: Omit<
    UseQueryOptions<
      ProductAttributePresetResponse,
      FetchError,
      ProductAttributePresetResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<ProductAttributePresetResponse>("/tenants/product-attribute-presets"),
    queryKey: productAttributesQueryKeys.detail("preset"),
    ...options,
  })

  return { ...data, ...rest }
}

export const useApplyProductAttributePreset = (
  options?: UseMutationOptions<ApplyProductAttributePresetResponse, FetchError, void>
) => {
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<ApplyProductAttributePresetResponse>(
        "/tenants/product-attribute-presets",
        { method: "POST" }
      ),
    onSuccess: (data, variables, context) => {
      invalidateAll()
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

/** How many products of the shop carry at least one characteristic. */
export const useProductAttributeCoverage = (
  options?: Omit<
    UseQueryOptions<
      ProductAttributeCoverageResponse,
      FetchError,
      ProductAttributeCoverageResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<ProductAttributeCoverageResponse>("/tenants/product-attribute-coverage"),
    queryKey: productAttributeValuesQueryKeys.detail("coverage"),
    ...options,
  })

  return { ...data, ...rest }
}

/** The characteristics that apply to ONE product, each with its value. */
export const useProductAttributeValues = (
  productId: string,
  options?: Omit<
    UseQueryOptions<
      ProductAttributeValuesResponse,
      FetchError,
      ProductAttributeValuesResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<ProductAttributeValuesResponse>(
        `/tenants/products/${productId}/attributes`
      ),
    queryKey: productAttributeValuesQueryKeys.detail(productId),
    ...options,
  })

  return { ...data, ...rest }
}

export const useUpdateProductAttributeValues = (
  productId: string,
  options?: UseMutationOptions<
    ProductAttributeValuesResponse,
    FetchError,
    ProductAttributeValuesBody
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<ProductAttributeValuesResponse>(
        `/tenants/products/${productId}/attributes`,
        { method: "POST", body: payload }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({
        queryKey: productAttributeValuesQueryKeys.detail(productId),
      })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
