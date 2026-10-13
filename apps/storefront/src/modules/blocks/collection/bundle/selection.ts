import type { HttpTypes } from "@medusajs/types"

import { getHomeRegion } from "@lib/data/home"
import { listProducts } from "@lib/data/products"
import { getOptionValueHex, isColorOption } from "@lib/util/color-option"
import { getProductPrice } from "@lib/util/get-product-price"
import { convertToLocale } from "@lib/util/money"
import { isPlaceholderOption } from "@lib/util/option-filter-groups"

/** One product of the set as the block draws it. */
export type BundleItem = {
  product: HttpTypes.StoreProduct
  /** The product's one variant; null when it has several, and the card links to its page instead. */
  variant: HttpTypes.StoreProductVariant | null
  /** The price its card shows, the cheapest variant's, as `ProductCard` shows it. */
  price: string
  /** The cheapest variant on sale: its percentage off (as `getProductPrice` gives it) and its price before. */
  sale: { percent: string; original: string } | null
  /** The card's unit line and colour dots (`cardMetaOf`). */
  unit: string
  swatches: { id: string; value: string; hex: string }[]
  /** No variant can go into the cart: stock is tracked, nothing is left and back orders are off. */
  outOfStock: boolean
}

export type Bundle = {
  items: BundleItem[]
  /** The sum of the cards' prices, formatted in the region's currency. */
  total: string
  /** The products the button adds: those with one variant. */
  addable: BundleItem[]
  /** Titles of the products out of stock, in the set's order; any of them turns the button off. */
  outOfStock: string[]
  /** Whether a product of the set has several variants, so the button cannot add it. */
  needsChoice: boolean
}

/**
 * The unit line and the colour dots of `ProductCard`, by its rule: the values the product's variants use, colours as
 * dots, the rest joined by « · », Medusa's «Default option» left out. `ProductCard` computes them inline and is a
 * part `dev` has, so the rule is repeated here, not shared; `bundle.test.tsx` draws both and holds them equal.
 */
export function cardMetaOf(product: HttpTypes.StoreProduct): Pick<BundleItem, "unit" | "swatches"> {
  const used = new Set(product.variants?.flatMap((v) => v.options?.map((o) => o.id).filter(Boolean) ?? []) ?? [])
  const options = product.options ?? []
  const unit = options
    .filter((o) => !isColorOption(o) && !isPlaceholderOption(o))
    .flatMap((o) => o.values?.filter((v) => used.has(v.id)).map((v) => v.value) ?? [])
    .join(" · ")
  const swatches = options
    .filter((o) => isColorOption(o))
    .flatMap((o) => o.values?.filter((v) => used.has(v.id)) ?? [])
    .flatMap((v) => {
      const hex = getOptionValueHex(v)
      return hex === undefined ? [] : [{ id: v.id, value: v.value, hex }]
    })
  return { unit, swatches }
}

/** The rule of `ProductActions` and the home's add button: stock is not tracked, back orders are allowed, or some is left. */
const variantInStock = (variant: HttpTypes.StoreProductVariant) =>
  !variant.manage_inventory || Boolean(variant.allow_backorder) || (variant.inventory_quantity ?? 0) > 0

/**
 * The set in the template's order, from the products the shop answered. A handle the shop does not
 * have, or a product with no price in the region, is left out: it cannot be bought here. Pure, so the
 * tests run it on plain objects.
 */
export function bundleOf(products: HttpTypes.StoreProduct[], handles: string[], locale: string): Bundle | null {
  const items: BundleItem[] = []
  const amounts: number[] = []
  let currency = ""
  for (const name of handles) {
    const product = products.find((candidate) => candidate.handle === name)
    if (!product) continue
    const cheapest = getProductPrice({ product, locale }).cheapestPrice
    if (!cheapest) continue
    const variants = product.variants ?? []
    items.push({
      product,
      variant: variants.length === 1 ? variants[0] : null,
      price: cheapest.calculated_price,
      sale:
        cheapest.price_type === "sale"
          ? { percent: cheapest.percentage_diff, original: cheapest.original_price }
          : null,
      ...cardMetaOf(product),
      outOfStock: !variants.some(variantInStock),
    })
    amounts.push(cheapest.calculated_price_number)
    currency ||= cheapest.currency_code
  }
  if (items.length < 2) return null

  return {
    items,
    total: convertToLocale({ amount: amounts.reduce((sum, amount) => sum + amount, 0), currency_code: currency, locale }),
    addable: items.filter((item) => item.variant !== null),
    outOfStock: items.filter((item) => item.outOfStock).map((item) => item.product.title ?? item.product.handle ?? ""),
    needsChoice: items.some((item) => item.variant === null),
  }
}

/**
 * The shop's products of the set, through the `"use server"` loaders the home listings use: the home
 * region, so the prices are the region's, and `/store/products`, which answers published products of
 * the shop's sales channel only. Null when there is no region or the read fails; the block then draws
 * nothing.
 */
export async function readBundle(handles: string[], locale: string): Promise<Bundle | null> {
  try {
    const region = await getHomeRegion()
    if (!region) return null
    const { response } = await listProducts({
      regionId: region.id,
      queryParams: { handle: handles, limit: handles.length },
    })
    return bundleOf(response.products, handles, locale)
  } catch {
    console.error(`collection/bundle: could not read the products ${handles.join(", ")}`)
    return null
  }
}
