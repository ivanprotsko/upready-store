import { listProductsWithSort } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import type { OptionValueIds } from "@lib/util/product-option-filters"
import { PRODUCT_GRID_CLASS } from "@modules/products/components/product-card"
import ProductPreview from "@modules/products/components/product-preview"
import { Pagination } from "@modules/store/components/pagination"
import type { SortOptions } from "@modules/store/components/refinement-list/sort-products"

export const PRODUCT_LIMIT = 12

/**
 * The listing when a filter leaves nothing. Deliberately a grid with no items
 * rather than a message: the filter bar above it is what explains the zero, and
 * the pagination is gone because there is nothing to page through.
 */
const EmptyGrid = () => (
  <ul
    className="grid grid-cols-2 w-full small:grid-cols-2 medium:grid-cols-3 gap-x-2 small:gap-x-6 gap-y-8"
    data-testid="products-list"
  />
)

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
      <ul className={PRODUCT_GRID_CLASS} data-testid="products-list" data-total-count={count}>
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
