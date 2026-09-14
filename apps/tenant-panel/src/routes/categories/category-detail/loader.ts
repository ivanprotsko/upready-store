import { HttpTypes } from "@medusajs/types"
import { LoaderFunctionArgs } from "react-router-dom"

import { categoriesQueryKeys } from "../../../hooks/api/categories"
import { sdk } from "../../../lib/client"
import { queryClient } from "../../../lib/query-client"

const categoryDetailQuery = (id: string) => ({
  queryKey: categoriesQueryKeys.detail(id),
  // tenant-panel: `sdk.admin.productCategory.retrieve` hardcodes
  // `/admin/product-categories/:id`, which a tenant token cannot reach, so the
  // loader answered 404 and the ErrorBoundary took the whole `/categories/:id`
  // subtree with it. Same substitution piece 1 made in the product loaders.
  queryFn: async () =>
    sdk.client.fetch<HttpTypes.AdminProductCategoryResponse>(
      `/tenants/product-categories/${id}`
    ),
})

export const categoryLoader = async ({ params }: LoaderFunctionArgs) => {
  const id = params.id
  const query = categoryDetailQuery(id!)

  return queryClient.ensureQueryData(query)
}
