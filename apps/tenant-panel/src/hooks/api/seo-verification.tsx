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

// b10-panel-gaps: the search-console ownership tags. `PUT` shipped with
// t11-seo-redirects and had no field anywhere; `GET` is this task's, added so
// the form opens filled in. Same shape as hooks/api/analytics-settings.tsx.

export type TenantSeoVerification = {
  yandex: string | null
  google: string | null
}

export type TenantSeoVerificationResponse = {
  seo_verification: TenantSeoVerification
}

const SEO_VERIFICATION_QUERY_KEY = "tenant-seo-verification" as const
export const seoVerificationQueryKeys = queryKeysFactory(SEO_VERIFICATION_QUERY_KEY)

export const useTenantSeoVerification = (
  options?: Omit<
    UseQueryOptions<
      TenantSeoVerificationResponse,
      FetchError,
      TenantSeoVerificationResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<TenantSeoVerificationResponse>("/tenants/seo-verification"),
    queryKey: seoVerificationQueryKeys.details(),
    ...options,
  })

  return { ...data, ...rest }
}

export const useUpdateTenantSeoVerification = (
  options?: UseMutationOptions<
    TenantSeoVerificationResponse,
    FetchError,
    TenantSeoVerification
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<TenantSeoVerificationResponse>("/tenants/seo-verification", {
        method: "PUT",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: seoVerificationQueryKeys.details() })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
