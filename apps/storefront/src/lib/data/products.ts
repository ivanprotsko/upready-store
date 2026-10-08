"use server"

import { sdk } from "@lib/config"
import type { OptionValueIds } from "@lib/util/product-option-filters"
import { sortProducts } from "@lib/util/sort-products"
import {
  groupOptionFilters,
  type ProductOptionFilterGroup,
} from "@lib/util/option-filter-groups"
import type { HttpTypes } from "@medusajs/types"
import type { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import { getAuthHeaders, getCacheOptions, getCountryCode } from "./cookies"
import { getRegion, retrieveRegion } from "./regions"
import { DEFAULT_REGION } from "@lib/util/env"
import { locales } from "@i18n/config"

type ProductListQueryParams = (HttpTypes.FindParams &
  HttpTypes.StoreProductListParams) & {
  options?: string[]
  option_value_id?: string | string[]
}

export const listProducts = async ({
  pageParam = 1,
  queryParams,
  countryCode,
  regionId,
}: {
  pageParam?: number
  queryParams?: ProductListQueryParams
  countryCode?: string
  regionId?: string
}): Promise<{
  response: { products: HttpTypes.StoreProduct[]; count: number }
  nextPage: number | null
  queryParams?: ProductListQueryParams
}> => {
  if (!countryCode && !regionId) {
    throw new Error("Country code or region ID is required")
  }

  const limit = queryParams?.limit || 12
  const _pageParam = Math.max(pageParam, 1)
  const offset = _pageParam === 1 ? 0 : (_pageParam - 1) * limit

  let region: HttpTypes.StoreRegion | undefined | null

  if (countryCode) {
    region = await getRegion(countryCode)
  } else {
    region = await retrieveRegion(regionId!)
  }

  if (!region) {
    return {
      response: { products: [], count: 0 },
      nextPage: null,
    }
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("products")),
    // A-15 (46df audit): a tag clears on a write, but nothing else ever did —
    // a dropped revalidation webhook (`notifyStorefrontRevalidate`, now
    // retried, but still not guaranteed) left a stale price or an out-of-stock
    // item on the shelf indefinitely. An hour is the ceiling, not the norm:
    // the tag still clears it within seconds on the ordinary path.
    revalidate: 3600,
  }

  return sdk.client
    .fetch<{ products: HttpTypes.StoreProduct[]; count: number }>(
      `/store/products`,
      {
        method: "GET",
        query: {
          limit,
          offset,
          region_id: region?.id,
          fields:
            "*variants.calculated_price,+variants.inventory_quantity,*variants.images,*variants.options,+options.values.metadata,+metadata,+tags,*categories,*categories.parent_category,*categories.parent_category.parent_category",
          ...queryParams,
        },
        headers,
        next,
        cache: "force-cache",
      }
    )
    .then(({ products, count }) => {
      const nextPage = count > offset + limit ? pageParam + 1 : null

      return {
        response: {
          products,
          count,
        },
        nextPage: nextPage,
        queryParams,
      }
    })
}

export const listProductOptionFilters = async (
  queryParams?: Pick<ProductListQueryParams, "category_id" | "collection_id">
): Promise<ProductOptionFilterGroup[]> => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("products")),
    // A-15 (46df audit): a tag clears on a write, but nothing else ever did —
    // a dropped revalidation webhook (`notifyStorefrontRevalidate`, now
    // retried, but still not guaranteed) left a stale price or an out-of-stock
    // item on the shelf indefinitely. An hour is the ceiling, not the norm:
    // the tag still clears it within seconds on the ordinary path.
    revalidate: 3600,
  }

  const { products } = await sdk.client
    .fetch<{ products: HttpTypes.StoreProduct[] }>(`/store/products`, {
      method: "GET",
      query: {
        limit: 100,
        // Wildcards, not `options.title`: the Store API translates a nested relation
        // into the request's locale only when it is asked for whole (measured on
        // shipshift.dev 2026-09-12 — `options.title` answered "Size", `*options`
        // answered "Размер" for the same `x-medusa-locale: ru`).
        fields:
          "id,*options,*options.values,variants.options.id,variants.options.option_id",
        ...queryParams,
      },
      headers,
      next,
      cache: "force-cache",
    })
    .catch(() => ({ products: [] as HttpTypes.StoreProduct[] }))

  return groupOptionFilters(products)
}

/** One request of the sorted listing, and how many of them it makes at most (2000 products). */
const SORTED_LISTING_PAGE = 100
const SORTED_LISTING_MAX_PAGES = 20

export const listProductsWithSort = async ({
  page = 0,
  queryParams,
  sortBy = "created_at",
  countryCode,
  optionValueIds,
}: {
  page?: number
  queryParams?: ProductListQueryParams
  sortBy?: SortOptions
  countryCode: string
  optionValueIds?: OptionValueIds
}): Promise<{
  response: { products: HttpTypes.StoreProduct[]; count: number }
  nextPage: number | null
  queryParams?: ProductListQueryParams
}> => {
  const limit = queryParams?.limit || 12
  const selectedValueIds = Array.from(
    new Set((optionValueIds || []).filter(Boolean))
  )

  // The whole listing is read and sorted here, a hundred at a time. It used to stop at the
  // first hundred, so a category of 187 showed 100 and no sign of the rest (ask a0e1).
  const products: HttpTypes.StoreProduct[] = []
  for (let pageParam: number | null = 1; pageParam !== null && pageParam <= SORTED_LISTING_MAX_PAGES; ) {
    const { response, nextPage } = await listProducts({
      pageParam,
      queryParams: {
        ...queryParams,
        ...(selectedValueIds.length
          ? { option_value_id: selectedValueIds }
          : {}),
        limit: SORTED_LISTING_PAGE,
      },
      countryCode,
    })
    products.push(...response.products)
    pageParam = nextPage
  }

  const sortedProducts = sortProducts(products, sortBy)
  const filteredCount = sortedProducts.length
  const pageParam = (page - 1) * limit
  const nextPage =
    filteredCount > pageParam + limit ? pageParam + limit : null
  const paginatedProducts = sortedProducts.slice(pageParam, pageParam + limit)

  return {
    response: {
      products: paginatedProducts,
      count: filteredCount,
    },
    nextPage,
    queryParams,
  }
}

export const searchProducts = async (
  query: string
): Promise<HttpTypes.StoreProduct[]> => {
  const trimmed = query.trim()
  const countryCode = (await getCountryCode()) ?? DEFAULT_REGION

  if (!trimmed) {
    const {
      response: { products },
    } = await listProducts({ queryParams: { limit: 8 }, countryCode })
    return products
  }

  const needle = trimmed.toLowerCase()
  const next = {
    ...(await getCacheOptions("products")),
    // A-15 (46df audit): a tag clears on a write, but nothing else ever did —
    // a dropped revalidation webhook (`notifyStorefrontRevalidate`, now
    // retried, but still not guaranteed) left a stale price or an out-of-stock
    // item on the shelf indefinitely. An hour is the ceiling, not the norm:
    // the tag still clears it within seconds on the ordinary path.
    revalidate: 3600,
  }

  const perLocale = await Promise.all(
    locales.map((loc) =>
      sdk.client
        .fetch<{
          products: {
            id: string
            title?: string | null
            description?: string | null
          }[]
        }>("/store/products", {
          method: "GET",
          query: { limit: 100, fields: "id,title,description" },
          headers: { "x-medusa-locale": loc },
          next,
          cache: "force-cache",
        })
        .then((r) => r.products)
        .catch(() => [])
    )
  )

  const matchedIds = new Set<string>()
  for (const products of perLocale) {
    for (const product of products) {
      const haystack =
        `${product.title ?? ""} ${product.description ?? ""}`.toLowerCase()
      if (haystack.includes(needle)) {
        matchedIds.add(product.id)
      }
    }
  }

  if (!matchedIds.size) {
    return []
  }

  const {
    response: { products },
  } = await listProducts({
    queryParams: { id: Array.from(matchedIds), limit: 8 },
    countryCode,
  })

  return products
}
