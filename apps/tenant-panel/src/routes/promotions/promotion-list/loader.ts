import { HttpTypes } from "@medusajs/types"
import { QueryClient } from "@tanstack/react-query"
import { promotionsQueryKeys } from "../../../hooks/api/promotions"
import { sdk } from "../../../lib/client"
import { queryClient } from "../../../lib/query-client"

const params = {
  limit: 20,
  offset: 0,
}

const promotionsListQuery = () => ({
  queryKey: promotionsQueryKeys.list(params),
  // tenant-panel: the js-sdk's admin module hardcodes `/admin/...`, so the
  // loader fetches the tenant route by URL. Same call, same query key as the
  // Admin's loader, so usePromotions() reads this prefetch from the cache.
  queryFn: async () =>
    sdk.client.fetch<HttpTypes.AdminPromotionListResponse>("/tenants/promotions", {
      query: params,
    }),
})

export const promotionsLoader = (client: QueryClient) => {
  return async () => {
    const query = promotionsListQuery()

    return (
      queryClient.getQueryData<HttpTypes.AdminPromotionListResponse>(
        query.queryKey
      ) ?? (await client.fetchQuery(query))
    )
  }
}
