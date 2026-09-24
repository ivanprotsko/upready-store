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

// o25-login-methods: how this shop's buyers sign in. Same shape as
// hooks/api/seo-verification.tsx — one GET/PUT pair, no per-field merge
// needed because the backend stores a single scalar.

export type BuyerLoginMethod = "email" | "yandex" | "both"

export type TenantLoginSettings = {
  method: BuyerLoginMethod
  yandex_platform_available: boolean
}

export type TenantLoginSettingsResponse = {
  login_settings: TenantLoginSettings
}

const LOGIN_SETTINGS_QUERY_KEY = "tenant-login-settings" as const
export const loginSettingsQueryKeys = queryKeysFactory(LOGIN_SETTINGS_QUERY_KEY)

export const useTenantLoginSettings = (
  options?: Omit<
    UseQueryOptions<TenantLoginSettingsResponse, FetchError, TenantLoginSettingsResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.client.fetch<TenantLoginSettingsResponse>("/tenants/login-settings"),
    queryKey: loginSettingsQueryKeys.details(),
    ...options,
  })

  return { ...data, ...rest }
}

export const useUpdateTenantLoginSettings = (
  options?: UseMutationOptions<TenantLoginSettingsResponse, FetchError, { method: BuyerLoginMethod }>
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<TenantLoginSettingsResponse>("/tenants/login-settings", {
        method: "PUT",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: loginSettingsQueryKeys.details() })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
