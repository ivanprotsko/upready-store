import { Suspense } from "react"
import { getTranslations } from "next-intl/server"

import type { OptionValueIds } from "@lib/util/product-option-filters"
import type { AttributeSelection } from "@lib/util/product-attribute-filters"
import { listProductAttributeFacets } from "@lib/data/product-attributes"
import {
  CATALOG_COLUMNS_CLASS,
  CATALOG_MAIN_COLUMN_CLASS,
} from "@modules/products/components/product-card"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import type { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import RefinementList from "@modules/store/components/refinement-list"
import MobileRefinement from "@modules/store/components/mobile-refinement"
import { ActiveFilters, FilterSidebar } from "@modules/store/components/filter-panel"
import CategorySidebar from "@modules/store/components/category-sidebar"
import { withoutOptionsNamedLikeFacets } from "@lib/util/option-filter-groups"
import { listCategories } from "@lib/data/categories"
import { isOlavkaShop } from "@lib/data/olavka-shop"
import CategoryImageTiles from "@modules/categories/components/category-image-tiles"
import { categoriesWithImages } from "@lib/util/category-image"
import { listProductOptionFilters } from "@lib/data/products"

import ProductsListing, { CatalogCount } from "./products-listing"
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
  countryCode,
  optionValueIds,
  attributeSelection,
}: {
  sortBy?: SortOptions
  countryCode: string
  optionValueIds?: OptionValueIds
  /** The shop's own characteristics picked in the URL, t15-product-attributes. */
  attributeSelection?: AttributeSelection
}) => {
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

      {/* D4 (t-2026-10-20-61): one compact head. From lg the title at 28px, the count beside it
          and the sorting sit in one row. Below lg the count goes under the title, so a phone
          never wraps either of them; both stay on one line (the title is cut with an ellipsis
          before it would wrap) and the filters button keeps its width. The breadcrumb above is
          the text line. */}
      <div className="mb-6 flex items-center justify-between gap-x-4">
        <div className="flex min-w-0 flex-col whitespace-nowrap lg:flex-row lg:items-baseline lg:gap-x-3">
          <h1
            className="truncate text-[28px] font-semibold leading-9 tracking-[-0.01em] text-ui-fg-base"
            data-testid="store-page-title"
          >
            {t("Store.allProducts")}
          </h1>
          <Suspense fallback={null}>
            <CatalogCount
              sortBy={sort}
              countryCode={countryCode}
              optionValueIds={optionValueIds}
              attributeProductIds={attributeFacets.productIds}
            />
          </Suspense>
        </div>
        <div className="flex shrink-0 items-center gap-x-4">
          <MobileRefinement
            sortBy={sort}
            optionFilters={optionFilters}
            attributeFacets={attributeFacets.facets}
            className="lg:hidden text-ui-fg-base hover:text-ui-fg-subtle transition-colors"
          />
          <div className="hidden lg:block">
            <RefinementList
              sortBy={sort}
              display="sort"
              data-testid="sort-by-container"
            />
          </div>
        </div>
      </div>

      {/* No heading, for the same reason the category page's tiles carry none: a
          real one needs a catalog key in all 36 locales (AGENTS.md, "Localization"). */}
      <CategoryImageTiles categories={picturedCategories} dense />

      <div className={CATALOG_COLUMNS_CLASS}>
        <div className="hidden flex-col gap-y-8 lg:flex">
          <CategorySidebar categories={categories} showCategoryList={!olavka} />
          <FilterSidebar optionFilters={optionFilters} attributeFacets={attributeFacets.facets} />
        </div>
        <div className={CATALOG_MAIN_COLUMN_CLASS}>
          <ActiveFilters optionFilters={optionFilters} attributeFacets={attributeFacets.facets} />
          <Suspense fallback={<SkeletonProductGrid besideSidebar />}>
            <ProductsListing
              sortBy={sort}
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
