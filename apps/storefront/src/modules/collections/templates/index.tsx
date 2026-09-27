import { Suspense } from "react"
import { getLocale, getTranslations } from "next-intl/server"

import type { OptionValueIds } from "@lib/util/product-option-filters"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import type { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import RefinementList from "@modules/store/components/refinement-list"
import MobileRefinement from "@modules/store/components/mobile-refinement"
import CategorySidebar from "@modules/store/components/category-sidebar"
import { ActiveFilters, FilterSidebar } from "@modules/store/components/filter-panel"
import PaginatedProducts, {
  PRODUCT_LIMIT,
} from "@modules/store/templates/paginated-products"
import { listCategories } from "@lib/data/categories"
import { countOptionBuckets, listProductOptionFilters } from "@lib/data/products"
import { isOlavkaShop } from "@lib/data/olavka-shop"
import type { HttpTypes } from "@medusajs/types"
import Breadcrumb, {
  type BreadcrumbItem,
} from "@modules/common/components/breadcrumb"
import JsonLd from "@modules/common/components/json-ld"
import { buildBreadcrumbJsonLd } from "@lib/util/json-ld"

export default async function CollectionTemplate({
  sortBy,
  collection,
  page,
  countryCode,
  optionValueIds,
}: {
  sortBy?: SortOptions
  collection: HttpTypes.StoreCollection
  page?: string
  countryCode: string
  optionValueIds?: OptionValueIds
}) {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"

  const [t, locale, categories, optionFilters, olavka] = await Promise.all([
    getTranslations(),
    getLocale(),
    listCategories(),
    listProductOptionFilters({ collection_id: [collection.id] }),
    isOlavkaShop(),
  ])
  // The count next to each option checkbox, on the Olavka shop (Ivan's remark 23).
  const optionCounts = olavka
    ? await countOptionBuckets({
        groups: optionFilters,
        optionValueIds,
        queryParams: { collection_id: [collection.id] },
        countryCode,
      })
    : undefined

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: t("Breadcrumb.home"), href: "/" },
    { label: t("Breadcrumb.store"), href: "/store" },
    { label: collection.title },
  ]

  const breadcrumbJsonLd = await buildBreadcrumbJsonLd({
    crumbs: breadcrumbItems,
    locale,
    path: `/collections/${collection.handle}`,
  })

  return (
    <div className="flex flex-col py-6 content-container">
      {breadcrumbJsonLd && <JsonLd data={breadcrumbJsonLd} />}

      <Breadcrumb items={breadcrumbItems} />

      <div className="mb-8 lg:grid lg:grid-cols-[280px_1fr] lg:items-center">
        <div className="flex items-center justify-between">
          <h1 className="h3-webs">{collection.title}</h1>
          <MobileRefinement
            sortBy={sort}
            optionFilters={optionFilters}
            optionCounts={optionCounts?.byValue}
            className="lg:hidden text-ui-fg-base hover:text-ui-fg-subtle transition-colors"
          />
        </div>
        <div className="mt-4 hidden lg:mt-0 lg:flex lg:flex-row lg:items-center lg:justify-between">
          {/* The filters live in the left column (`FilterSidebar`); this row keeps the sorting. */}
          <span />
          <RefinementList
            sortBy={sort}
            display="sort"
            data-testid="sort-by-container"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[248px_1fr] gap-8">
        <div className="hidden flex-col gap-y-8 lg:flex">
          <CategorySidebar categories={categories} />
          <FilterSidebar optionFilters={optionFilters} optionCounts={optionCounts?.byBucket} />
        </div>
        <div className="w-full">
          <ActiveFilters optionFilters={optionFilters} />
          <Suspense
            fallback={
              <SkeletonProductGrid
                numberOfProducts={collection.products?.length || PRODUCT_LIMIT}
              />
            }
          >
            <PaginatedProducts
              sortBy={sort}
              page={pageNumber}
              collectionId={collection.id}
              countryCode={countryCode}
              optionValueIds={optionValueIds}
            />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
