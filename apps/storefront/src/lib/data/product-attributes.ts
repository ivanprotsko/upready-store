"use server"

/**
 * Read path for the shop's own product characteristics (t15-product-attributes):
 * the «Характеристики» block of a product page and the facets of the catalogue
 * filter bar.
 *
 * Both come from the tenant behind THIS storefront's publishable key, so a
 * single-store install with no tenant behind its key gets an empty answer and
 * renders nothing — not an error page.
 *
 * Counts are never computed here. The backend answers them with one aggregate
 * per facet over the whole catalogue; a count derived from the page of products
 * this storefront happens to hold would be a number the buyer cannot trust
 * (and would be wrong past the first hundred products).
 *
 * One shared cache tag, `"product-attributes"`, so an owner's edit in the panel
 * clears the block and the filter bar together.
 */

import { sdk } from "@lib/config"
import { getCacheOptions } from "./cookies"
import {
  toFacetQuery,
  type AttributeSelection,
} from "@lib/util/product-attribute-filters"

const ATTRIBUTES_TAG = "product-attributes"

export type ProductAttributeType = "text" | "number" | "select" | "boolean"

/** One row of the product page's «Характеристики» block. */
export type ProductAttributeRow = {
  key: string
  name: string
  type: ProductAttributeType
  unit: string | null
  position: number
  value: string | number | boolean | null
  /** A choice's label in the visitor's language; null for the other types. */
  label: string | null
}

export type AttributeFacetValue = {
  value: string
  label: string
  count: number
  disabled: boolean
}

export type AttributeFacet = {
  key: string
  name: string
  type: ProductAttributeType
  unit: string | null
  position: number
  values: AttributeFacetValue[]
  range: { min: number; max: number; count: number } | null
}

export type AttributeFacets = {
  facets: AttributeFacet[]
  /**
   * The products the selection leaves, or `null` when nothing is selected.
   * `null` is «do not narrow»; an EMPTY array is «nothing matches», and the two
   * must never be confused — an empty `id` filter is no filter at all to
   * Medusa, and would put the whole catalogue back on the page.
   */
  productIds: string[] | null
  count: number
}

const EMPTY: AttributeFacets = { facets: [], productIds: null, count: 0 }

let warnedUnreachable = false

const warnOnce = (what: string, error: unknown) => {
  if (warnedUnreachable) {
    return
  }
  warnedUnreachable = true
  // Tolerating is not hiding (rule 20): the catalogue still renders, and the
  // failure is in the server log once per process.
  console.error(`${what}: /store/tenant/product-attributes did not answer`, error)
}

/** The characteristics shown on one product's page, already in the owner's order. */
export const listProductAttributes = async (
  productId: string
): Promise<ProductAttributeRow[]> => {
  try {
    const next = { ...(await getCacheOptions(ATTRIBUTES_TAG)) }
    const { product_attributes } = await sdk.client.fetch<{
      product_attributes: ProductAttributeRow[]
    }>("/store/tenant/product-attributes", {
      query: { product_id: productId },
      next,
      cache: "force-cache",
    })
    return product_attributes ?? []
  } catch (error) {
    warnOnce("listProductAttributes", error)
    return []
  }
}

/**
 * The filter bar for the catalogue, plus the products the current selection
 * leaves. `categoryId` narrows to a category and its subtree.
 */
export const listProductAttributeFacets = async ({
  categoryId,
  selection,
}: {
  categoryId?: string
  selection?: AttributeSelection
}): Promise<AttributeFacets> => {
  try {
    const next = { ...(await getCacheOptions(ATTRIBUTES_TAG)) }
    const data = await sdk.client.fetch<{
      facets: AttributeFacet[]
      product_ids: string[] | null
      count: number
    }>("/store/tenant/product-attributes/facets", {
      query: {
        ...(categoryId ? { category_id: categoryId } : {}),
        ...toFacetQuery(selection ?? {}),
      },
      next,
      cache: "force-cache",
    })

    return {
      facets: [...(data.facets ?? [])].sort((a, b) => {
        if (a.position !== b.position) {
          return a.position - b.position
        }
        return a.name.localeCompare(b.name)
      }),
      productIds: data.product_ids ?? null,
      count: data.count ?? 0,
    }
  } catch (error) {
    warnOnce("listProductAttributeFacets", error)
    return EMPTY
  }
}
