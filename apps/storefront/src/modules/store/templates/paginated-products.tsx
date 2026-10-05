import { cookies } from "next/headers"
import { getTranslations } from "next-intl/server"

import { isOlavkaShop } from "@lib/data/olavka-shop"
import { listProductsWithSort } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import {
  CATALOG_PER_PAGE_COOKIE,
  CATALOG_VIEW_COOKIE,
  DEFAULT_CATALOG_PER_PAGE,
  DEFAULT_CATALOG_VIEW,
  parseCatalogPerPage,
  parseCatalogView,
  type CatalogView,
} from "@lib/util/catalog-view"
import type { OptionValueIds } from "@lib/util/product-option-filters"
import { PRODUCT_GRID_BESIDE_SIDEBAR_CLASS } from "@modules/products/components/product-card"
import ProductPreview from "@modules/products/components/product-preview"
import { Pagination } from "@modules/store/components/pagination"
import type { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import ViewControls from "@modules/store/components/view-controls"

export const PRODUCT_LIMIT = DEFAULT_CATALOG_PER_PAGE

/**
 * The listing in each view the buyer can pick (`ViewControls`): the shop's grid, rows of one
 * product each, and a denser grid with one column more than the shop's own at every width.
 */
const LISTING_CLASS: Record<CatalogView, string> = {
  grid: PRODUCT_GRID_BESIDE_SIDEBAR_CLASS,
  list: "flex w-full flex-col divide-y divide-ui-border-base [&>li]:py-4 [&>li:first-child]:pt-0",
  compact: "grid w-full grid-cols-3 gap-x-3 gap-y-6 small:grid-cols-4 small:gap-x-4 small:gap-y-8 large:grid-cols-5",
}

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
  // The Olavka shops keep their own grid and page size (Ivan's widths of 27.09), so they
  // get no controls and no cookie changes their listing.
  const [olavka, cookieStore] = await Promise.all([isOlavkaShop(), cookies()])
  const view = olavka ? DEFAULT_CATALOG_VIEW : parseCatalogView(cookieStore.get(CATALOG_VIEW_COOKIE)?.value)
  const perPage = olavka
    ? DEFAULT_CATALOG_PER_PAGE
    : parseCatalogPerPage(cookieStore.get(CATALOG_PER_PAGE_COOKIE)?.value)

  const queryParams: PaginatedProductsParams = {
    limit: perPage,
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

  const totalPages = Math.ceil(count / perPage)

  return (
    <>
      {!olavka && <ViewControls view={view} perPage={perPage} />}
      <ul
        className={LISTING_CLASS[view]}
        data-testid="products-list"
        data-total-count={count}
        data-view={view}
      >
        {products.map((p, index) => {
          return (
            <li key={p.id} className="min-w-0">
              <ProductPreview
                product={p}
                region={region}
                priority={index < 4}
                layout={view === "list" ? "row" : "card"}
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
