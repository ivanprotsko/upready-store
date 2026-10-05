import { getTranslations } from "next-intl/server"

import { listProductsWithSort } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import type { OptionValueIds } from "@lib/util/product-option-filters"
import { PRODUCT_GRID_BESIDE_SIDEBAR_CLASS } from "@modules/products/components/product-card"
import ProductPreview from "@modules/products/components/product-preview"
import { Pagination } from "@modules/store/components/pagination"
import type { SortOptions } from "@modules/store/components/refinement-list/sort-products"

export const PRODUCT_LIMIT = 12

/**
 * The listing when a filter leaves nothing: a sentence that says so and what to do, in the
 * place the grid would take. It used to be an empty `<ul>`, which on a phone (where the
 * filters hide in a sheet) read as a page that failed to load. The list element stays, with
 * a zero total, because the filter sheet and the e2e suites read the count from it.
 */
const EmptyGrid = async () => {
  const t = await getTranslations("Filters")
  return (
    <>
      <ul className="hidden" data-testid="products-list" data-total-count={0} />
      <p
        className="rounded-[var(--radius,8px)] border border-dashed border-ui-border-base px-6 py-16 text-center txt-medium text-ui-fg-subtle"
        data-testid="products-empty"
      >
        {t("empty")}
      </p>
    </>
  )
}

type PaginatedProductsParams = {
  limit: number
  collection_id?: string[]
  category_id?: string[]
  id?: string[]
  order?: string
}

export default async function PaginatedProducts({
  sortBy,
  page,
  collectionId,
  categoryId,
  categoryIds,
  productsIds,
  countryCode,
  optionValueIds,
  attributeProductIds,
}: {
  sortBy?: SortOptions
  page: number
  collectionId?: string
  categoryId?: string
  categoryIds?: string[]
  productsIds?: string[]
  countryCode: string
  optionValueIds?: OptionValueIds
  /**
   * The products a characteristic filter leaves (t15-product-attributes):
   * `undefined`/`null` when nothing is selected, an EMPTY ARRAY when the
   * selection matches nothing. The two are not the same — an empty `id` filter
   * is NO filter to Medusa and would put the whole catalogue back on the page —
   * so an empty array returns early with the empty grid.
   */
  attributeProductIds?: string[] | null
}) {
  const queryParams: PaginatedProductsParams = {
    limit: 12,
  }

  if (collectionId) {
    queryParams["collection_id"] = [collectionId]
  }

  if (categoryIds?.length) {
    queryParams["category_id"] = categoryIds
  } else if (categoryId) {
    queryParams["category_id"] = [categoryId]
  }

  if (attributeProductIds && attributeProductIds.length === 0) {
    return <EmptyGrid />
  }

  // Both narrowings are id lists, so the two intersect rather than override.
  const narrowedIds =
    attributeProductIds && productsIds
      ? productsIds.filter((id) => attributeProductIds.includes(id))
      : (attributeProductIds ?? productsIds)

  if (narrowedIds) {
    if (narrowedIds.length === 0) {
      return <EmptyGrid />
    }
    queryParams["id"] = narrowedIds
  }

  if (sortBy === "created_at") {
    queryParams["order"] = "created_at"
  }

  const region = await getRegion(countryCode)

  if (!region) {
    return null
  }

  const {
    response: { products, count },
  } = await listProductsWithSort({
    page,
    queryParams,
    sortBy,
    countryCode,
    optionValueIds,
  })

  const totalPages = Math.ceil(count / PRODUCT_LIMIT)

  return (
    <>
      <ul className={PRODUCT_GRID_BESIDE_SIDEBAR_CLASS} data-testid="products-list" data-total-count={count}>
        {products.map((p, index) => {
          return (
            <li key={p.id} className="min-w-0">
              <ProductPreview
                product={p}
                region={region}
                priority={index < 4}
              />
            </li>
          )
        })}
      </ul>
      {totalPages > 1 && (
        <Pagination
          data-testid="product-pagination"
          page={page}
          totalPages={totalPages}
        />
      )}
    </>
  )
}
