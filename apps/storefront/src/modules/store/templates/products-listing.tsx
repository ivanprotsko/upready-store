import { getTranslations } from "next-intl/server"

import { catalogListingView } from "@lib/data/catalog-view"
import { listProductsWithSort } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import type { CatalogView } from "@lib/util/catalog-view"
import { FIRST_SCREENS_PRODUCTS } from "@lib/util/infinite-list"
import { PRODUCT_GRID_BESIDE_SIDEBAR_CLASS } from "@modules/products/components/product-card"
import SkeletonProductPreview from "@modules/skeletons/components/skeleton-product-preview"
import InfiniteProducts from "@modules/store/components/infinite-products"
import ProductListItems from "@modules/store/components/product-list-items"
import ViewControls from "@modules/store/components/view-controls"

import { listingQuery, type ListingInput } from "./listing-query"

/** The products the server renders, and the size of the loader in their place while it does. */
export const PRODUCT_LIMIT = FIRST_SCREENS_PRODUCTS

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

/**
 * A product list: the catalog, a category, a collection. It has no pages (rule 5zg): the server
 * renders the first screens here, and `InfiniteProducts` brings the rest in the background,
 * ahead of the buyer's scroll. An old address with `?page=N` opens the list from its start.
 */
export default async function ProductsListing(input: ListingInput) {
  // A shop the switch does not name, and every Olavka shop, keeps the grid with no controls,
  // and no cookie is read (`catalogListingView`).
  const { controls, view } = await catalogListingView()
  const queryParams = listingQuery(input)

  if (!queryParams) {
    return <EmptyGrid />
  }

  const region = await getRegion(input.countryCode)

  if (!region) {
    return null
  }

  const {
    response: { products, count },
  } = await listProductsWithSort({
    offset: 0,
    queryParams: { ...queryParams, limit: FIRST_SCREENS_PRODUCTS },
    sortBy: input.sortBy,
    countryCode: input.countryCode,
    optionValueIds: input.optionValueIds,
  })

  return (
    <>
      {controls && <ViewControls view={view} />}
      {/* A new sort, filter or view is a new list: the key starts it over from the top. */}
      <InfiniteProducts
        key={JSON.stringify([input, view])}
        listing={input}
        shown={products.length}
        total={count}
        className={LISTING_CLASS[view]}
        view={controls ? view : undefined}
        placeholder={<SkeletonProductPreview />}
      >
        <ProductListItems products={products} region={region} view={view} priorityCount={4} />
      </InfiniteProducts>
    </>
  )
}

/**
 * The catalog header's counter (t-2026-10-20-61 D4): how many products the current filters
 * leave, in the existing «N products» string. One product is asked for, only to read the
 * total. Renders nothing when there is no region or no query, so a header never shows a
 * wrong zero.
 */
export async function CatalogCount(input: ListingInput) {
  const queryParams = listingQuery(input)
  const region = queryParams ? await getRegion(input.countryCode) : null

  if (!queryParams || !region) {
    return null
  }

  const [t, { response }] = await Promise.all([
    getTranslations("Home"),
    listProductsWithSort({
      offset: 0,
      queryParams: { ...queryParams, limit: 1 },
      sortBy: input.sortBy,
      countryCode: input.countryCode,
      optionValueIds: input.optionValueIds,
    }),
  ])

  return (
    <span className="txt-medium text-ui-fg-muted tabular-nums" data-testid="store-count">
      {t("gallery.productsCount", { count: response.count })}
    </span>
  )
}
