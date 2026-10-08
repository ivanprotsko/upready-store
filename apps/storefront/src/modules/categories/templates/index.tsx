import { notFound } from "next/navigation"
import { Suspense } from "react"
import { getLocale, getTranslations } from "next-intl/server"

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
import CategorySidebar from "@modules/store/components/category-sidebar"
import { ActiveFilters, FilterSidebar } from "@modules/store/components/filter-panel"
import { withoutOptionsNamedLikeFacets } from "@lib/util/option-filter-groups"
import PaginatedProducts, {
  PRODUCT_LIMIT,
} from "@modules/store/templates/paginated-products"
import { listCategories } from "@lib/data/categories"
import { isOlavkaShop } from "@lib/data/olavka-shop"
import { listProductOptionFilters } from "@lib/data/products"
import CategoryImageTiles from "@modules/categories/components/category-image-tiles"
import CategoryHeaderImage from "@modules/categories/components/category-header-image"
import { getCategoryAncestors } from "@lib/util/category-ancestors"
import type { HttpTypes } from "@medusajs/types"
import Breadcrumb, {
  type BreadcrumbItem,
} from "@modules/common/components/breadcrumb"
import JsonLd from "@modules/common/components/json-ld"
import { buildBreadcrumbJsonLd } from "@lib/util/json-ld"

export default async function CategoryTemplate({
  category,
  sortBy,
  page,
  countryCode,
  optionValueIds,
  attributeSelection,
  subcategoryHandles = [],
}: {
  category: HttpTypes.StoreProductCategory
  sortBy?: SortOptions
  page?: string
  countryCode: string
  optionValueIds?: OptionValueIds
  /** The shop's own characteristics picked in the URL, t15-product-attributes. */
  attributeSelection?: AttributeSelection
  subcategoryHandles?: string[]
}) {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"

  if (!category || !countryCode) notFound()

  const subcategories = category.category_children ?? []
  const selectedSubcategories = subcategories.filter((c) =>
    subcategoryHandles.includes(c.handle)
  )
  const categoryIds = selectedSubcategories.length
    ? selectedSubcategories.map((c) => c.id)
    : [category.id, ...subcategories.map((c) => c.id)]

  const [t, locale, categories, allOptionFilters, attributeFacets, olavka] = await Promise.all([
    getTranslations(),
    getLocale(),
    listCategories(),
    listProductOptionFilters({ category_id: categoryIds }),
    // The facets follow the category the visitor is looking at, subtree
    // included, so their counts describe THIS listing and not the whole shop.
    listProductAttributeFacets({
      categoryId: category.id,
      selection: attributeSelection,
    }),
    isOlavkaShop(),
  ])

  const optionFilters = withoutOptionsNamedLikeFacets(allOptionFilters, attributeFacets.facets)

  const ancestors = getCategoryAncestors(category)

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: t("Breadcrumb.home"), href: "/" },
    { label: t("Breadcrumb.store"), href: "/store" },
    ...ancestors.map((ancestor) => ({
      label: ancestor.name,
      href: `/categories/${ancestor.handle}`,
    })),
    selectedSubcategories.length > 0
      ? { label: category.name, href: `/categories/${category.handle}` }
      : { label: category.name },
    ...(selectedSubcategories.length > 0
      ? [{ label: selectedSubcategories.map((c) => c.name).join(", ") }]
      : []),
  ]

  const breadcrumbJsonLd = await buildBreadcrumbJsonLd({
    crumbs: breadcrumbItems,
    locale,
    path: `/categories/${category.handle}`,
  })

  return (
    <div
      className="flex flex-col py-6 content-container"
      data-testid="category-container"
    >
      {breadcrumbJsonLd && <JsonLd data={breadcrumbJsonLd} />}

      <Breadcrumb items={breadcrumbItems} />

      <div className="mb-8 lg:grid lg:grid-cols-[280px_1fr] lg:items-center">
        <div className="flex items-center justify-between gap-4">
          {/* The picture the owner gave THIS category, not only its children's
              (f16-category-image-not-shown). It renders nothing when the field is
              empty, so a shop that uploaded none keeps today's header exactly. */}
          <div className="flex min-w-0 items-center gap-3 small:gap-4">
            <CategoryHeaderImage category={category} />
            <h1 className="h3-webs truncate" data-testid="category-page-title">
              {category.name}
            </h1>
          </div>
          <MobileRefinement
            sortBy={sort}
            optionFilters={optionFilters}
            attributeFacets={attributeFacets.facets}
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

      {/* No heading here on purpose: a real one needs a catalog key in all 36
          locales (AGENTS.md, "Localization"), out of scope for this pass —
          the tiles read as a continuation of the category page above them. */}
      {selectedSubcategories.length === 0 ? (
        <CategoryImageTiles categories={subcategories} />
      ) : null}

      <div className={CATALOG_COLUMNS_CLASS}>
        <div className="hidden flex-col gap-y-8 lg:flex">
          <CategorySidebar
            categories={categories}
            activeCategoryId={category.id}
            showCategoryList={!olavka}
          />
          <FilterSidebar optionFilters={optionFilters} attributeFacets={attributeFacets.facets} />
        </div>
        <div className={CATALOG_MAIN_COLUMN_CLASS}>
          <ActiveFilters optionFilters={optionFilters} attributeFacets={attributeFacets.facets} />
          {category.description && (
            <div className="mb-8 text-base-regular">
              <p>{category.description}</p>
            </div>
          )}
          <Suspense
            fallback={
              <SkeletonProductGrid
                numberOfProducts={category.products?.length || PRODUCT_LIMIT}
                besideSidebar
              />
            }
          >
            <PaginatedProducts
              sortBy={sort}
              page={pageNumber}
              categoryIds={categoryIds}
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
