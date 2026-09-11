import { HttpTypes } from "@medusajs/types"
import { LoaderFunctionArgs } from "react-router-dom"
import { promotionsQueryKeys } from "../../../hooks/api/promotions"
import { sdk } from "../../../lib/client"
import { queryClient } from "../../../lib/query-client"

const promotionDetailQuery = (id: string) => ({
  queryKey: promotionsQueryKeys.detail(id),
  // tenant-panel: `/tenants/promotions/:id` instead of the admin module's
  // hardcoded `/admin/promotions/:id`.
  queryFn: async () =>
    sdk.client.fetch<HttpTypes.AdminPromotionResponse>(`/tenants/promotions/${id}`),
})

export const promotionLoader = async ({ params }: LoaderFunctionArgs) => {
  const id = params.id
  const query = promotionDetailQuery(id!)

  return queryClient.ensureQueryData(query)
}
