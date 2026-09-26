import type { HttpTypes } from "@medusajs/types"

import { getOptionValueHex } from "./color-option"

/**
 * What Medusa mints for a product created without options (`createProductsWorkflow`
 * in core-flows): one option titled "Default option" holding one value, "Default
 * option value". It is bookkeeping, never a choice a shopper makes, and it reached the
 * storefront as a filter — "Default option · Default option value" on `/store` and in
 * collections (measured on acme and globex, 2026-09-12).
 *
 * f12-owner-raw-keys: the same English sentinel also reached the tenant PANEL's own
 * screens (a shop owner saw "Опции: Default option / Default option value" on her
 * product card), so the seed paths and the panel's own product-create wizard now mint
 * "Опция по умолчанию"/"Значение по умолчанию" instead going forward
 * (`migration-scripts/data/abstract-datasets.ts`, `migration-scripts/lib/products.ts`,
 * `workflows/tenant/seed-tenant-dataset`, tenant-panel's `product-create/constants.ts`).
 * Products already seeded before that change still carry the English strings — nothing
 * rewrites existing data — so BOTH sentinels are recognized here, or a live shop's
 * existing catalog would start showing the English placeholder as a real filter again.
 */
export const MEDUSA_DEFAULT_OPTION_TITLE = "Default option"
export const MEDUSA_DEFAULT_OPTION_VALUE = "Default option value"
const PLACEHOLDER_OPTION_TITLES = new Set([
  MEDUSA_DEFAULT_OPTION_TITLE,
  "Опция по умолчанию",
])
const PLACEHOLDER_OPTION_VALUES = new Set([
  MEDUSA_DEFAULT_OPTION_VALUE,
  "Значение по умолчанию",
])

export type ProductOptionFilterValue = {
  id: string
  label: string
  hex?: string
}

export type ProductOptionFilterGroup = {
  id: string
  title: string
  values: ProductOptionFilterValue[]
}

export function isPlaceholderOption(
  option: Pick<HttpTypes.StoreProductOption, "title" | "values">
): boolean {
  if (option.title && PLACEHOLDER_OPTION_TITLES.has(option.title)) {
    return true
  }
  const values = option.values ?? []
  return (
    values.length === 1 &&
    !!values[0]?.value &&
    PLACEHOLDER_OPTION_VALUES.has(values[0].value)
  )
}

/**
 * Medusa mints one `product_option` row per product, so the same option title
 * ("Количество", "Размер"…) gets a distinct `option.id` on every product. Grouping
 * by that id used to render one filter chip per PRODUCT instead of per option name
 * (`t-2026-09-12-seed-option-filter-duplicates`; live on Cherkashina's 38 products
 * as ~25 chips). Group by the normalised title instead and union the values.
 */
const normalizeOptionTitle = (title: string): string => title.trim().toLocaleLowerCase()

/**
 * One filter group per distinct option NAME across the listing (not per
 * `option.id`, see above), each holding the union of the values some variant
 * actually uses across every product carrying that name. Titles and values arrive
 * already in the request's locale when the products were fetched with
 * `*options,*options.values` (`lib/data/products.ts`); the placeholder option above
 * is left out.
 */
export function groupOptionFilters(
  products: HttpTypes.StoreProduct[]
): ProductOptionFilterGroup[] {
  const groups = new Map<
    string,
    { id: string; title: string; values: Map<string, { label: string; hex?: string }> }
  >()

  for (const product of products) {
    const usedByOption = new Map<string, Set<string>>()
    for (const variant of product.variants ?? []) {
      for (const optionValue of variant.options ?? []) {
        const optionId = optionValue.option_id
        if (!optionId || optionValue.id == null) continue
        if (!usedByOption.has(optionId)) usedByOption.set(optionId, new Set())
        usedByOption.get(optionId)!.add(optionValue.id)
      }
    }

    for (const option of product.options ?? []) {
      if (!option.id || isPlaceholderOption(option)) continue
      const usedValues = usedByOption.get(option.id)
      const title = option.title ?? ""
      const normalizedTitle = normalizeOptionTitle(title)
      let group = groups.get(normalizedTitle)
      if (!group) {
        group = { id: option.id, title, values: new Map() }
        groups.set(normalizedTitle, group)
      }
      for (const optionValue of option.values ?? []) {
        if (!optionValue.id || !optionValue.value) continue
        if (usedValues && !usedValues.has(optionValue.id)) continue
        group.values.set(optionValue.id, {
          label: optionValue.value,
          hex: getOptionValueHex(optionValue),
        })
      }
    }
  }

  return Array.from(groups.values(), (group) => ({
    id: group.id,
    title: group.title,
    values: Array.from(group.values, ([valueId, { label, hex }]) => ({
      id: valueId,
      label,
      hex,
    })),
  }))
}

/**
 * One facet per name. A shop can carry «Объём» twice: as a variant option («50 мл») and as
 * the owner's own characteristic (a number in ml). The characteristic is the one the owner
 * defined for filtering, with counts and a range, so the option of the same name steps aside
 * instead of showing the visitor two filters called the same.
 */
export function withoutOptionsNamedLikeFacets(
  groups: ProductOptionFilterGroup[],
  facets: { name: string }[]
): ProductOptionFilterGroup[] {
  const facetNames = new Set(facets.map((facet) => facet.name.trim().toLowerCase()))
  return groups.filter((group) => !facetNames.has(group.title.trim().toLowerCase()))
}

/** One checkbox of an option group: a label and every value id carrying it. */
export type OptionFilterBucket = { label: string; ids: string[] }

/**
 * An option group's checkboxes, one per label. Inside one group the same label can come
 * from several products (each product mints its own value ids), and one checkbox drives
 * all of its ids together.
 */
export function optionBuckets(group: ProductOptionFilterGroup): OptionFilterBucket[] {
  const byLabel = new Map<string, OptionFilterBucket>()
  for (const value of group.values) {
    const key = value.label.trim().toLowerCase()
    const bucket = byLabel.get(key)
    if (bucket) {
      bucket.ids.push(value.id)
    } else {
      byLabel.set(key, { label: value.label.trim(), ids: [value.id] })
    }
  }
  return Array.from(byLabel.values())
}

/** The key of a checkbox's count (branch `redesign-olavka`, Ivan's remark 23). */
export const optionBucketKey = (groupId: string, label: string): string =>
  `${groupId}|${label.trim().toLowerCase()}`
