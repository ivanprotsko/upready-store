import { FetchError } from "@medusajs/js-sdk"
import { HttpTypes } from "@medusajs/types"
import { QueryKey, UseQueryOptions, useQuery } from "@tanstack/react-query"
import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// tenant-panel: piece 2. Tenant equivalent of the Admin's
// hooks/api/shipping-options.tsx, trimmed to the list the create-fulfillment
// and create-shipment forms read. `/tenants/shipping-options` re-exports the
// Admin's own GET handler: shipping options belong to the store's fulfillment
// sets, not to a tenant.

const SHIPPING_OPTIONS_QUERY_KEY = "shipping_options" as const
export const shippingOptionsQueryKeys = queryKeysFactory(
  SHIPPING_OPTIONS_QUERY_KEY
)

export const useShippingOptions = (
  query?: HttpTypes.AdminShippingOptionListParams,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminShippingOptionListResponse,
      FetchError,
      HttpTypes.AdminShippingOptionListResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<HttpTypes.AdminShippingOptionListResponse>(
        "/tenants/shipping-options",
        { query }
      ),
    queryKey: shippingOptionsQueryKeys.list(query),
    ...options,
  })

  return { ...data, ...rest }
}
