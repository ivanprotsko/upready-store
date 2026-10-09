"use server"

import type { ReactNode } from "react"

import { catalogListingView } from "@lib/data/catalog-view"
import { listProductsWithSort } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { clampRequest } from "@lib/util/infinite-list"
import ProductListItems from "@modules/store/components/product-list-items"
import { listingQuery, readListingInput } from "@modules/store/templates/listing-query"

export type ProductBatch = {
  /** The cards, drawn on the server by the same component as the first screens. */
  items: ReactNode
  received: number
  total: number
}

/**
 * The next products of a list, asked for by the browser in the background (rule 5zg): `limit`
 * products from `offset` of the list `listing` names, with its sort and its filters. The list
 * arrives as the browser sent it back, so it is read field by field (`readListingInput`) and the
 * request is held to `MAX_REQUEST_PRODUCTS` (`clampRequest`).
 *
 * A failed read throws: the list keeps what it shows and asks again (`createListLoader`).
 */
export async function loadProductBatch(
  listing: unknown,
  offset: unknown,
  limit: unknown
): Promise<ProductBatch> {
  const input = readListingInput(listing)
  const request = clampRequest(offset, limit)
  const queryParams = input ? listingQuery(input) : null

  if (!input || !queryParams) {
    return { items: null, received: 0, total: 0 }
  }

  const [{ view }, region] = await Promise.all([catalogListingView(), getRegion(input.countryCode)])

  if (!region) {
    return { items: null, received: 0, total: 0 }
  }

  const {
    response: { products, count },
  } = await listProductsWithSort({
    offset: request.offset,
    queryParams: { ...queryParams, limit: request.limit },
    sortBy: input.sortBy,
    countryCode: input.countryCode,
    optionValueIds: input.optionValueIds,
  })

  return {
    items: <ProductListItems products={products} region={region} view={view} />,
    received: products.length,
    total: count,
  }
}
