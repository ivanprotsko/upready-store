import { FetchError } from "@medusajs/js-sdk"
import { HttpTypes } from "@medusajs/types"
import { QueryKey, UseQueryOptions, useQuery } from "@tanstack/react-query"
import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// tenant-panel: own file, added by piece 3 because
// routes/products/common/components/category-combobox (copied verbatim, used
// by the organize section) imports it. ENDPOINT GAP: `GET
// /tenants/product-categories` is not in docs/tenant-panel/api-contract.md
// and is not implemented by the backend piece (the contract's read-only
// reference list only covers regions, price-preferences, product-types,
// product-tags, collections and shipping-profiles). This hook is written
// against the shape the other reference-list routes use
// (`{ product_categories, count, offset, limit }`, a plain re-export of the
// Admin's own GET handler) so it is ready the day that route exists, but
// today a call to it 404s. The combobox only fires this query when its
// popover is opened (`enabled: open` in category-combobox.tsx), so the
// category picker is broken (network error, no options) while the rest of
// the create form works; nothing else in the copied product screens reaches
// this hook.
const CATEGORIES_QUERY_KEY = "categories" as const
export const categoriesQueryKeys = queryKeysFactory(CATEGORIES_QUERY_KEY)

export const useProductCategories = (
  query?: HttpTypes.AdminProductCategoryListParams,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminProductCategoryListResponse,
      FetchError,
      HttpTypes.AdminProductCategoryListResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<HttpTypes.AdminProductCategoryListResponse>(
        "/tenants/product-categories",
        { query }
      ),
    queryKey: categoriesQueryKeys.list(query),
    ...options,
  })

  return { ...data, ...rest }
}
