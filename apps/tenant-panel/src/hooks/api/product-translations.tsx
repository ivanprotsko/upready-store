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

// t-cherk-37: the product's own title/subtitle/description, option titles and
// variant titles, one locale at a time. Storage is Medusa's own Translation
// module (no schema of its own the way `product-attributes.tsx` has one), so
// this hooks file is read/write against `/tenants/products/:id/translations`
// only — there is no list/create/delete screen, just the one product's drawer.

export type ProductTranslationLocaleEntry = {
  title?: string
  subtitle?: string
  description?: string
  options: Record<string, string>
  variants: Record<string, string>
}

export type ProductTranslationsResponse = {
  product: {
    id: string
    title: string
    subtitle: string | null
    description: string | null
  }
  options: { id: string; title: string }[]
  variants: { id: string; title: string }[]
  locales: Record<string, ProductTranslationLocaleEntry>
}

export type ProductTranslationsBody = {
  locale: string
  title?: string
  subtitle?: string | null
  description?: string | null
  options?: Record<string, string>
  variants?: Record<string, string>
}

const PRODUCT_TRANSLATIONS_QUERY_KEY = "tenant-product-translations" as const
export const productTranslationsQueryKeys = queryKeysFactory(
  PRODUCT_TRANSLATIONS_QUERY_KEY
)

export const useProductTranslations = (
  productId: string,
  options?: Omit<
    UseQueryOptions<
      ProductTranslationsResponse,
      FetchError,
      ProductTranslationsResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<ProductTranslationsResponse>(
        `/tenants/products/${productId}/translations`
      ),
    queryKey: productTranslationsQueryKeys.detail(productId),
    ...options,
  })

  return { ...data, ...rest }
}

export const useUpdateProductTranslations = (
  productId: string,
  options?: UseMutationOptions<
    ProductTranslationsResponse,
    FetchError,
    ProductTranslationsBody
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<ProductTranslationsResponse>(
        `/tenants/products/${productId}/translations`,
        { method: "PUT", body: payload }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({
        queryKey: productTranslationsQueryKeys.detail(productId),
      })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
