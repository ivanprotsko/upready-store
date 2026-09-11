import { HttpTypes } from "@medusajs/types"
import { LoaderFunctionArgs } from "react-router-dom"

import { productsQueryKeys } from "../../../hooks/api/products"
import { sdk } from "../../../lib/client"
import { queryClient } from "../../../lib/query-client"
import { PRODUCT_DETAIL_FIELDS } from "./constants"

const productDetailQuery = (id: string) => ({
  queryKey: productsQueryKeys.detail(id, { fields: PRODUCT_DETAIL_FIELDS }),
  // tenant-panel: sdk.admin.product.retrieve ->
  // sdk.client.fetch("/tenants/products/:id", ...)
  queryFn: async () =>
    sdk.client.fetch<HttpTypes.AdminProductResponse>(
      `/tenants/products/${id}`,
      { query: { fields: PRODUCT_DETAIL_FIELDS } }
    ),
})

export const productLoader = async ({ params }: LoaderFunctionArgs) => {
  const id = params.id
  const query = productDetailQuery(id!)

  const response = await queryClient.ensureQueryData({
    ...query,
    staleTime: 90000,
  })

  return response
}
