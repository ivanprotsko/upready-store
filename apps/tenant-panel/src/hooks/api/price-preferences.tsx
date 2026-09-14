import { FetchError } from "@medusajs/js-sdk"
import { HttpTypes } from "@medusajs/types"
import { QueryKey, UseQueryOptions, useQuery } from "@tanstack/react-query"
import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// tenant-panel: tenant equivalent of the Admin's hooks/api/price-preferences.tsx,
// read-only. `GET /tenants/price-preferences` is a global reference list
// (docs/tenant-panel/api-contract.md); `usePricePreference` and every mutation
// are dropped, nothing copied into the panel calls them.

const PRICE_PREFERENCES_QUERY_KEY = "price-preferences" as const
export const pricePreferencesQueryKeys = queryKeysFactory(
  PRICE_PREFERENCES_QUERY_KEY
)

export const usePricePreferences = (
  query?: HttpTypes.AdminPricePreferenceListParams,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminPricePreferenceListResponse,
      FetchError,
      HttpTypes.AdminPricePreferenceListResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<HttpTypes.AdminPricePreferenceListResponse>(
        "/tenants/price-preferences",
        { query }
      ),
    queryKey: pricePreferencesQueryKeys.list(query),
    ...options,
  })

  return { ...data, ...rest }
}
