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
import { queryKeysFactory } from "../../lib/query-key-factory"
import { TenantCustomerFilters } from "../table/query/use-customer-table-query"

// tenant-panel: piece 2 shipped `useCustomer`, the single retrieve the
// order-detail customer section and the transfer timeline entry use.
// t13-customers-screen adds the list, the CSV export and the response shape
// `GET /tenants/customers` answers — every row carries `orders_count` and
// `total_spent`, computed server-side
// (`apps/backend/src/api/tenants/customers/helpers.ts`), which the store-wide
// Admin customer has no equivalent of, hence the own type rather than
// `HttpTypes.AdminCustomer`.

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

export type TenantCustomerRow = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  has_account: boolean
  created_at: string
  orders_count: number
  total_spent: number
  currency_code: string | null
  last_order_at: string | null
}

export type TenantCustomerListResponse = {
  customers: TenantCustomerRow[]
  count: number
  offset: number
  limit: number
}

export const useCustomers = (
  query?: TenantCustomerFilters,
  options?: Omit<
    UseQueryOptions<
      TenantCustomerListResponse,
      FetchError,
      TenantCustomerListResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<TenantCustomerListResponse>("/tenants/customers", {
        query,
      }),
    queryKey: customersQueryKeys.list(query),
    ...options,
  })

  return { ...data, ...rest }
}

/**
 * `POST /tenants/customers/export` — same synchronous-CSV contract as
 * `useExportOrders` (`hooks/api/orders.tsx`): the panel has no notification
 * feed, so the route builds the file inline and answers `{ url }`, which the
 * caller opens directly.
 */
export type TenantCustomerExportResponse = {
  url: string
  filename: string
  count: number
}

export const useExportCustomers = (
  query?: Pick<TenantCustomerFilters, "q">,
  options?: UseMutationOptions<
    TenantCustomerExportResponse,
    FetchError,
    void
  >
) => {
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<TenantCustomerExportResponse>(
        "/tenants/customers/export",
        {
          method: "POST",
          query,
        }
      ),
    ...options,
  })
}
