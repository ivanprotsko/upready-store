import type { HttpTypes } from "@medusajs/types"

import { convertToLocale } from "@lib/util/money"
import { maxQuantity } from "@modules/products/components/in-cart-stepper/logic"

/**
 * One row of the table, resolved on the server from a product of the store API: plain data,
 * so the order cell, a client component, gets only what it draws and adds. Pure, no I/O.
 */

/** `in`: it ships; `backorder`: none on hand, the shop takes the order anyway; `out`: neither. */
export type StockState = "in" | "backorder" | "out"

/** What the order cell needs of the product and its one variant to add it to the cart. */
export type OrderLine = {
  product: Pick<HttpTypes.StoreProduct, "id" | "title" | "handle" | "thumbnail" | "metadata">
  variant: Pick<
    HttpTypes.StoreProductVariant,
    "id" | "title" | "manage_inventory" | "allow_backorder" | "inventory_quantity" | "calculated_price"
  >
  /** The most the cart may hold, the stock when the shop counts it; null: no limit. */
  max: number | null
}

export type PriceTableRow = {
  id: string
  handle: string
  title: string
  thumbnail: string | null
  /** The one variant's SKU; null for a product with several variants or none. */
  sku: string | null
  stock: StockState
  /** The region's price, the cheapest variant's for a product with several; null: none here. */
  price: string | null
  /** The pre-sale price while on sale. */
  originalPrice: string | null
  /** True when the variants cost differently, so the price is the lowest of them: «от …». */
  fromPrice: boolean
  /**
   * `add`: one variant, it can be bought; `choose`: several variants, the row links to the page;
   * `unavailable`: one variant, out of stock, no back orders.
   */
  order: { kind: "add"; line: OrderLine } | { kind: "choose" } | { kind: "unavailable" }
}

/** The stock of one variant, by the rule of `AddToBagButton` and `ProductActions`. */
export function variantStock(variant: HttpTypes.StoreProductVariant): StockState {
  if (!variant.manage_inventory || (variant.inventory_quantity ?? 0) > 0) return "in"
  return variant.allow_backorder ? "backorder" : "out"
}

/** A product's stock: in when any variant is, else to order when any variant takes orders. */
export function productStock(variants: readonly HttpTypes.StoreProductVariant[]): StockState {
  const states = variants.map(variantStock)
  if (states.includes("in")) return "in"
  return states.includes("backorder") ? "backorder" : "out"
}

/**
 * A price in the visitor's language and the region's currency. A whole amount has no
 * fraction (`1 200 ₽`, not `1 200,00 ₽`, QR-PRICE); any other keeps the currency's own.
 */
export function formatPrice(amount: number, currencyCode: string, locale: string): string {
  const whole = Number.isInteger(amount)
  return convertToLocale({
    amount,
    currency_code: currencyCode,
    locale,
    ...(whole ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
  })
}

type Priced = { amount: number; original: number; currency: string }

const priced = (variant: HttpTypes.StoreProductVariant): Priced | null => {
  const price = variant.calculated_price
  if (!price || typeof price.calculated_amount !== "number" || !price.currency_code) return null
  return {
    amount: price.calculated_amount,
    original: typeof price.original_amount === "number" ? price.original_amount : price.calculated_amount,
    currency: price.currency_code,
  }
}

export function toRow(product: HttpTypes.StoreProduct, locale: string): PriceTableRow {
  const variants = product.variants ?? []
  const only = variants.length === 1 ? variants[0] : null
  const prices = variants.map(priced).filter((each): each is Priced => each !== null)
  const cheapest = prices.reduce<Priced | null>((low, each) => (!low || each.amount < low.amount ? each : low), null)
  const stock = productStock(variants)

  let order: PriceTableRow["order"] = { kind: "choose" }
  if (only) {
    const max = maxQuantity(only)
    order =
      max >= 1
        ? {
            kind: "add",
            line: {
              product: {
                id: product.id,
                title: product.title,
                handle: product.handle,
                thumbnail: product.thumbnail,
                metadata: product.metadata,
              },
              variant: {
                id: only.id,
                title: only.title,
                manage_inventory: only.manage_inventory,
                allow_backorder: only.allow_backorder,
                inventory_quantity: only.inventory_quantity,
                calculated_price: only.calculated_price,
              },
              max: Number.isFinite(max) ? max : null,
            },
          }
        : { kind: "unavailable" }
  }

  return {
    id: product.id,
    handle: product.handle ?? "",
    title: product.title ?? "",
    thumbnail: product.thumbnail ?? null,
    sku: only?.sku || null,
    stock,
    price: cheapest ? formatPrice(cheapest.amount, cheapest.currency, locale) : null,
    originalPrice:
      cheapest && cheapest.original > cheapest.amount ? formatPrice(cheapest.original, cheapest.currency, locale) : null,
    fromPrice: new Set(prices.map((each) => each.amount)).size > 1,
    order,
  }
}

/** The rows of a selection: products with no handle (no page to link to) are left out. */
export function toRows(products: readonly HttpTypes.StoreProduct[], locale: string): PriceTableRow[] {
  return products.filter((product) => product.handle && product.title).map((product) => toRow(product, locale))
}
