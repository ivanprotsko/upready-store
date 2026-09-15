import { FetchError } from "@medusajs/js-sdk"
import {
  QueryKey,
  UseMutationOptions,
  UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query"

import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"
import { queryClient } from "../../lib/query-client"

// tenant-panel: own hook, no Admin counterpart — GET/PUT /tenants/analytics
// per t17-analytics step 1. Same shape as hooks/api/locale-settings.tsx.

export type TenantAnalyticsSettings = {
  yandex_metrica_id: string | null
  ga4_measurement_id: string | null
}

export type TenantAnalyticsResponse = { analytics: TenantAnalyticsSettings }

const ANALYTICS_QUERY_KEY = "tenant-analytics" as const
export const tenantAnalyticsQueryKeys = queryKeysFactory(ANALYTICS_QUERY_KEY)

export const useTenantAnalytics = (
  options?: Omit<
    UseQueryOptions<TenantAnalyticsResponse, FetchError, TenantAnalyticsResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.client.fetch<TenantAnalyticsResponse>("/tenants/analytics"),
    queryKey: tenantAnalyticsQueryKeys.details(),
    ...options,
  })

  return { ...data, ...rest }
}

export const useUpdateTenantAnalytics = (
  options?: UseMutationOptions<TenantAnalyticsResponse, FetchError, TenantAnalyticsSettings>
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<TenantAnalyticsResponse>("/tenants/analytics", {
        method: "PUT",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: tenantAnalyticsQueryKeys.details() })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
