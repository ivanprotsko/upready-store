import type { HttpTypes } from "@medusajs/types"

import { getOptionValueHex } from "./color-option"

/**
 * What Medusa mints for a product created without options (`createProductsWorkflow`
 * in core-flows): one option titled "Default option" holding one value, "Default
 * option value". It is bookkeeping, never a choice a shopper makes, and it reached the
 * storefront as a filter — "Default option · Default option value" on `/store` and in
 * collections (measured on acme and globex, 2026-09-12). The seed keys off the same
 * two strings (`migration-scripts/lib/products.ts`).
 */
export const MEDUSA_DEFAULT_OPTION_TITLE = "Default option"
export const MEDUSA_DEFAULT_OPTION_VALUE = "Default option value"

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
  if (option.title === MEDUSA_DEFAULT_OPTION_TITLE) {
    return true
  }
  const values = option.values ?? []
  return values.length === 1 && values[0]?.value === MEDUSA_DEFAULT_OPTION_VALUE
}

/**
 * One filter group per product option across the listing, each holding only the
 * values some variant actually uses. Titles and values arrive already in the
 * request's locale when the products were fetched with `*options,*options.values`
 * (`lib/data/products.ts`); the placeholder option above is left out.
 */
export function groupOptionFilters(
  products: HttpTypes.StoreProduct[]
): ProductOptionFilterGroup[] {
  const groups = new Map<
    string,
    { title: string; values: Map<string, { label: string; hex?: string }> }
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
      let group = groups.get(option.id)
      if (!group) {
        group = { title: option.title ?? "", values: new Map() }
        groups.set(option.id, group)
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

  return Array.from(groups, ([id, group]) => ({
    id,
    title: group.title,
    values: Array.from(group.values, ([valueId, { label, hex }]) => ({
      id: valueId,
      label,
      hex,
    })),
  }))
}
