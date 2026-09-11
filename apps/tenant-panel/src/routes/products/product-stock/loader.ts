import { HttpTypes } from "@medusajs/types"
import { LoaderFunctionArgs } from "react-router-dom"
import { sdk } from "../../../lib/client"
import { PRODUCT_VARIANT_IDS_KEY } from "../common/constants"

async function getProductStockData(id: string, productVariantIds?: string[]) {
  const CHUNK_SIZE = 20
  let offset = 0
  let totalCount = 0

  let allVariants: HttpTypes.AdminProductVariant[] = []

  do {
    // tenant-panel: sdk.admin.product.listVariants ->
    // sdk.client.fetch("/tenants/products/:id/variants", ...)
    const { variants: chunk, count } =
      await sdk.client.fetch<HttpTypes.AdminProductVariantListResponse>(
        `/tenants/products/${id}/variants`,
        {
          query: {
            id: productVariantIds,
            offset,
            limit: CHUNK_SIZE,
            fields:
              "id,title,sku,inventory_items,inventory_items.*,inventory_items.inventory,inventory_items.inventory.id,inventory_items.inventory.title,inventory_items.inventory.sku,*inventory_items.inventory.location_levels,product.thumbnail",
          },
        }
      )

    allVariants = [...allVariants, ...chunk]
    totalCount = count
    offset += CHUNK_SIZE
  } while (allVariants.length < totalCount)

  // tenant-panel: sdk.admin.stockLocation.list ->
  // sdk.client.fetch("/tenants/stock-locations", ...), the read-only
  // re-export of the Admin's own GET behind the tenant authentication.
  const { stock_locations } =
    await sdk.client.fetch<HttpTypes.AdminStockLocationListResponse>(
      "/tenants/stock-locations",
      { query: { limit: 9999, fields: "id,name" } }
    )

  return {
    variants: allVariants,
    locations: stock_locations,
  }
}

export const productStockLoader = async ({
  params,
  request,
}: LoaderFunctionArgs) => {
  const id = params.id!
  const searchParams = new URLSearchParams(request.url)
  const productVariantIds =
    searchParams.get(PRODUCT_VARIANT_IDS_KEY)?.split(",") || undefined

  const dataPromise = getProductStockData(id, productVariantIds)

  return {
    data: dataPromise,
  }
}
