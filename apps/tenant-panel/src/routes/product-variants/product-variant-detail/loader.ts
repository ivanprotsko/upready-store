import { HttpTypes } from "@medusajs/types"
import { LoaderFunctionArgs } from "react-router-dom"

import { variantsQueryKeys } from "../../../hooks/api/products"
import { sdk } from "../../../lib/client"
import { queryClient } from "../../../lib/query-client"
import { VARIANT_DETAIL_FIELDS } from "./constants"

const variantDetailQuery = (productId: string, variantId: string) => ({
  queryKey: variantsQueryKeys.detail(variantId, {
    fields: VARIANT_DETAIL_FIELDS,
  }),
  // tenant-panel: sdk.admin.product.retrieveVariant ->
  // sdk.client.fetch("/tenants/products/:id/variants/:variant_id", ...)
  queryFn: async () =>
    sdk.client.fetch<HttpTypes.AdminProductVariantResponse>(
      `/tenants/products/${productId}/variants/${variantId}`,
      { query: { fields: VARIANT_DETAIL_FIELDS } }
    ),
})

export const variantLoader = async ({ params }: LoaderFunctionArgs) => {
  const productId = params.id
  const variantId = params.variant_id

  const query = variantDetailQuery(productId!, variantId!)

  return queryClient.ensureQueryData(query)
}
