import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getCategoryByHandle } from "@lib/data/categories"
import { buildAlternates } from "@lib/util/alternates"
import { decodeSegments } from "@lib/util/decode-segment"
import { getCountryCode, getSiteName, getTenantDefaultLocale } from "@lib/data/cookies"
import { parseAttributeSelection } from "@lib/util/product-attribute-filters"
import { parseOptionValueIds } from "@lib/util/product-option-filters"
import { parseSubcategoryHandles } from "@lib/util/subcategory-filters"
import CategoryTemplate from "@modules/categories/templates"
import type { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import { getLocale, getTranslations } from "next-intl/server"
import { DEFAULT_REGION } from "@lib/util/env"
import { pageTitle } from "@lib/util/page-title"
import { seoOverride } from "@lib/util/tenant-seo"

type Props = {
  params: Promise<{ category: string[] }>
  searchParams: Promise<
    Record<string, string | string[] | undefined> & {
      sortBy?: SortOptions
      page?: string
      optionValueIds?: string | string[]
    }
  >
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params
  try {
    const [locale, t, productCategory, defaultLocale] = await Promise.all([
      getLocale(),
      getTranslations("Metadata.category"),
      getCategoryByHandle(decodeSegments(params.category)),
      getTenantDefaultLocale(),
    ])
    // No such category, or the read failed and `siteWideRead` has already said
    // so by name in the log. Both reach the visitor as a 404; the `catch` below
    // did the same by dereferencing undefined, which only read as intentional
    // once the loader's type admitted the case.
    if (!productCategory) {
      notFound()
    }
    const override = seoOverride(productCategory, locale, defaultLocale)
    const title = await pageTitle(override.title || productCategory.name)
    const description =
      override.description ||
      productCategory.description?.trim() ||
      t("description", {
        category: productCategory.name,
        siteName: await getSiteName(),
      })
    const categoryPath = `/categories/${params.category.join("/")}`

    return {
      title,
      description,
      alternates: await buildAlternates(locale, categoryPath),
    }
  } catch {
    notFound()
  }
}

export default async function CategoryPage(props: Props) {
  const [params, searchParams, countryCode] = await Promise.all([
    props.params,
    props.searchParams,
    getCountryCode(),
  ])

  const { sortBy, page } = searchParams
  const optionValueIds = parseOptionValueIds(searchParams)
  const attributeSelection = parseAttributeSelection(searchParams)
  const subcategoryHandles = parseSubcategoryHandles(searchParams)

  const productCategory = await getCategoryByHandle(decodeSegments(params.category))

  if (!productCategory) {
    notFound()
  }

  return (
    <CategoryTemplate
      category={productCategory}
      sortBy={sortBy}
      page={page}
      countryCode={countryCode ?? DEFAULT_REGION}
      optionValueIds={optionValueIds}
      attributeSelection={attributeSelection}
      subcategoryHandles={subcategoryHandles}
    />
  )
}
