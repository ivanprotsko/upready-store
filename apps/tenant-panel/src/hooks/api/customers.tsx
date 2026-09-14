import { FetchError } from "@medusajs/js-sdk"
import { HttpTypes } from "@medusajs/types"
import { QueryKey, UseQueryOptions, useQuery } from "@tanstack/react-query"
import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// tenant-panel: piece 2. Tenant equivalent of the Admin's
// hooks/api/customers.tsx, trimmed to the single retrieve the order-detail
// customer section and the transfer timeline entry use. There is no list hook
// and no `/tenants/customers` list route: that would enumerate every shopper of
// the store. `GET /tenants/customers/:id` answers only while one of the
// tenant's own orders names that customer, and 404s otherwise.

const CUSTOMERS_QUERY_KEY = "customers" as const
export const customersQueryKeys = queryKeysFactory(CUSTOMERS_QUERY_KEY)

export const useCustomer = (
  id: string,
  query?: Record<string, any>,
  options?: Omit<
    UseQueryOptions<
      { customer: HttpTypes.AdminCustomer },
      FetchError,
      { customer: HttpTypes.AdminCustomer },
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: customersQueryKeys.detail(id),
    queryFn: async () =>
      sdk.client.fetch<{ customer: HttpTypes.AdminCustomer }>(
        `/tenants/customers/${id}`,
        { query }
      ),
    ...options,
  })

  return { ...data, ...rest }
}
