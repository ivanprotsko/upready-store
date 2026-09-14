import { FetchError } from "@medusajs/js-sdk"
import { HttpTypes } from "@medusajs/types"
import { QueryKey, UseQueryOptions, useQuery } from "@tanstack/react-query"
import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// tenant-panel: piece 2. Tenant equivalent of the Admin's
// hooks/api/reservations.tsx, trimmed to the list the order summary and the
// create-fulfillment form read. `/tenants/reservations` is scoped to the line
// items of the tenant's own orders, so a tenant never sees stock another
// tenant has reserved.

const RESERVATION_ITEMS_QUERY_KEY = "reservation_items" as const
export const reservationItemsQueryKeys = queryKeysFactory(
  RESERVATION_ITEMS_QUERY_KEY
)

export const useReservationItems = (
  query?: HttpTypes.AdminGetReservationsParams,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminReservationListResponse,
      FetchError,
      HttpTypes.AdminReservationListResponse,
      QueryKey
    >,
    "queryKey" | "queryFn"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<HttpTypes.AdminReservationListResponse>(
        "/tenants/reservations",
        { query }
      ),
    queryKey: reservationItemsQueryKeys.list(query),
    ...options,
  })

  return { ...data, ...rest }
}
