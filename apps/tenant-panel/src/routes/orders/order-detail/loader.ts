import { LoaderFunctionArgs } from "react-router-dom"

import { HttpTypes } from "@medusajs/types"

import { ordersQueryKeys } from "../../../hooks/api/orders"
import { sdk } from "../../../lib/client"
import { queryClient } from "../../../lib/query-client"
import { DEFAULT_FIELDS } from "./constants"

const orderDetailQuery = (id: string) => ({
  queryKey: ordersQueryKeys.detail(id),
  // tenant-panel: `sdk.admin.order.retrieve` calls GET /admin/orders/:id, which
  // a tenant token cannot reach. Same request against the tenant's own route.
  queryFn: async () =>
    sdk.client.fetch<HttpTypes.AdminOrderResponse>(`/tenants/orders/${id}`, {
      query: { fields: DEFAULT_FIELDS },
    }),
})

export const orderLoader = async ({ params }: LoaderFunctionArgs) => {
  const id = params.id
  const query = orderDetailQuery(id!)

  return queryClient.ensureQueryData(query)
}
