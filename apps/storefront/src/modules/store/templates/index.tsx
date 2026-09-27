import { Suspense } from "react"
import { getTranslations } from "next-intl/server"

import type { OptionValueIds } from "@lib/util/product-option-filters"
import type { AttributeSelection } from "@lib/util/product-attribute-filters"
import { listProductAttributeFacets } from "@lib/data/product-attributes"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import type { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import RefinementList from "@modules/store/components/refinement-list"
import MobileRefinement from "@modules/store/components/mobile-refinement"
import { ActiveFilters, FilterSidebar } from "@modules/store/components/filter-panel"
import CategorySidebar from "@modules/store/components/category-sidebar"
import { withoutOptionsNamedLikeFacets } from "@lib/util/option-filter-groups"
import { listCategories } from "@lib/data/categories"
import CategoryImageTiles from "@modules/categories/components/category-image-tiles"
import { categoriesWithImages } from "@lib/util/category-image"
import { countOptionBuckets, listProductOptionFilters } from "@lib/data/products"
import { isOlavkaShop } from "@lib/data/olavka-shop"

import PaginatedProducts from "./paginated-products"
import Breadcrumb from "@modules/common/components/breadcrumb"


/**
 * How many pictured categories the catalog strip draws. The grid is three across
 * (four when there are exactly four), so twelve is four full rows on desktop and
 * the point past which a strip stops introducing the shop and starts being the
 * page. A shop with more keeps the rest in the sidebar and the nav, as before.
 */
const CATALOG_TILE_LIMIT = 12

const StoreTemplate = async ({
  sortBy,
  page,
  countryCode,
  optionValueIds,
  attributeSelection,
}: {
  sortBy?: SortOptions
  page?: string
  countryCode: string
  optionValueIds?: OptionValueIds
  /** The shop's own characteristics picked in the URL, t15-product-attributes. */
  attributeSelection?: AttributeSelection
}) => {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"
  const [t, categories, allOptionFilters, attributeFacets, olavka] = await Promise.all([
    getTranslations(),
    listCategories(),
    listProductOptionFilters(),
    listProductAttributeFacets({ selection: attributeSelection }),
    isOlavkaShop(),
  ])

  // The categories whose picture the owner uploaded in the panel. Empty for a shop
  // that uploaded none, and CategoryImageTiles then renders nothing at all, so this
  // strip appears only where there is something to show (f16-category-image-not-shown:
  // the catalog was one of the three pages that drew the picture nowhere).
  const optionFilters = withoutOptionsNamedLikeFacets(allOptionFilters, attributeFacets.facets)
  // The count next to each option checkbox, on the Olavka shop (Ivan's remark 23).
  const optionCounts = olavka
    ? await countOptionBuckets({
        groups: optionFilters,
        optionValueIds,
        narrowedIds: attributeFacets.productIds,
        countryCode,
      })
    : undefined

  const picturedCategories = categoriesWithImages(categories, CATALOG_TILE_LIMIT)

  return (
    <div
      className="flex flex-col py-6 content-container"
      data-testid="category-container"
    >
      <Breadcrumb
        items={[
          { label: t("Breadcrumb.home"), href: "/" },
          { label: t("Breadcrumb.store") }
        ]}
      />

      <div className="mb-8 lg:grid lg:grid-cols-[280px_1fr] lg:items-center">
        <div className="flex items-center justify-between">
          <h1 className="h3-webs" data-testid="store-page-title">
            {t("Store.allProducts")}
          </h1>
          <MobileRefinement
            sortBy={sort}
            optionFilters={optionFilters}
            optionCounts={optionCounts?.byValue}
            attributeFacets={attributeFacets.facets}
            className="lg:hidden text-ui-fg-base hover:text-ui-fg-subtle transition-colors"
          />
        </div>
        <div className="mt-4 hidden lg:mt-0 lg:flex lg:flex-row lg:items-center lg:justify-between">
          {/* The filters live in the left column now (`FilterSidebar`); this row keeps the
              sorting, on the right where the grid ends. */}
          <span />
          <RefinementList
            sortBy={sort}
            display="sort"
            data-testid="sort-by-container"
          />
        </div>
      </div>

      {/* No heading, for the same reason the category page's tiles carry none: a
          real one needs a catalog key in all 36 locales (AGENTS.md, "Localization"). */}
      <CategoryImageTiles categories={picturedCategories} dense />

      <div className="grid grid-cols-1 lg:grid-cols-[248px_1fr] gap-8">
        <div className="hidden flex-col gap-y-8 lg:flex">
          <CategorySidebar categories={categories} />
          <FilterSidebar
            optionFilters={optionFilters}
            attributeFacets={attributeFacets.facets}
            optionCounts={optionCounts?.byBucket}
          />
        </div>
        <div className="w-full">
          <ActiveFilters optionFilters={optionFilters} attributeFacets={attributeFacets.facets} />
          <Suspense fallback={<SkeletonProductGrid />}>
            <PaginatedProducts
              sortBy={sort}
              page={pageNumber}
              countryCode={countryCode}
              optionValueIds={optionValueIds}
              attributeProductIds={attributeFacets.productIds}
            />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

export default StoreTemplate
