import type { Metadata } from "next"

import type { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import StoreTemplate from "@modules/store/templates"
import { buildAlternates } from "@lib/util/alternates"
import { getCountryCode } from "@lib/data/cookies"
import { parseOptionValueIds } from "@lib/util/product-option-filters"
import { parseAttributeSelection } from "@lib/util/product-attribute-filters"
import { getTranslations, getLocale } from "next-intl/server"
import { pageTitle } from "@lib/util/page-title"

type StorePageSearchParams = Record<string, string | string[] | undefined> & {
  sortBy?: SortOptions
  optionValueIds?: string | string[]
}

type Params = {
  searchParams: Promise<StorePageSearchParams>
}

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([
    getTranslations("Metadata.store"),
    getLocale(),
  ])
  return {
    title: await pageTitle(t("title")),
    description: t("description"),
    alternates: await buildAlternates(locale, "/store"),
  }
}

export default async function StorePage(props: Params) {
  const searchParams = await props.searchParams
  const countryCode = await getCountryCode()
  // `page` of an old address is read by nothing: a product list has no pages (rule 5zg),
  // so `?page=N` opens the list from its start.
  const { sortBy } = searchParams
  const optionValueIds = parseOptionValueIds(searchParams)
  const attributeSelection = parseAttributeSelection(searchParams)

  return (
    <StoreTemplate
      sortBy={sortBy}
      countryCode={countryCode ?? ""}
      optionValueIds={optionValueIds}
      attributeSelection={attributeSelection}
    />
  )
}
