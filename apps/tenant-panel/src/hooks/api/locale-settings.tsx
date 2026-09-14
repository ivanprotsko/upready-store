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
import type { LocaleCode } from "../../lib/locale-catalog"

// tenant-panel: own hook file, no Admin counterpart — GET/PUT
// /tenants/locale-settings per t06-locale-currency. Same shape as
// hooks/api/home.tsx: the response is the whole document or null (nothing
// saved yet), never a list.

export type TenantLocaleSettingsDocument = {
  default_locale: LocaleCode
  enabled_locales: LocaleCode[]
  default_country: string | null
}

export type TenantLocaleSettingsResponse = {
  locale_settings: TenantLocaleSettingsDocument | null
}

const LOCALE_SETTINGS_QUERY_KEY = "tenant-locale-settings" as const
export const tenantLocaleSettingsQueryKeys = queryKeysFactory(
  LOCALE_SETTINGS_QUERY_KEY
)

export const useTenantLocaleSettings = (
  options?: Omit<
    UseQueryOptions<
      TenantLocaleSettingsResponse,
      FetchError,
      TenantLocaleSettingsResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<TenantLocaleSettingsResponse>("/tenants/locale-settings"),
    queryKey: tenantLocaleSettingsQueryKeys.details(),
    ...options,
  })

  return { ...data, ...rest }
}

export const useUpdateTenantLocaleSettings = (
  options?: UseMutationOptions<
    TenantLocaleSettingsResponse,
    FetchError,
    TenantLocaleSettingsDocument
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<TenantLocaleSettingsResponse>("/tenants/locale-settings", {
        method: "PUT",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({
        queryKey: tenantLocaleSettingsQueryKeys.details(),
      })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
