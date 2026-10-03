import type { HttpTypes } from "@medusajs/types"

import type { DraftLine } from "./queue"

/**
 * The cart line a product page can draw before the server has created it: what the
 * sidebar, the header count and the cart page need to show a first add at once. The
 * price is the variant's calculated price for the region; the reply replaces all of it
 * with the server's line.
 */
export function draftLineFor(
  product: HttpTypes.StoreProduct,
  variant: HttpTypes.StoreProductVariant
): DraftLine {
  const thumbnail = product.thumbnail ?? product.images?.[0]?.url ?? undefined

  return {
    variant_id: variant.id,
    product_id: product.id,
    title: product.title,
    product_title: product.title,
    product_handle: product.handle ?? undefined,
    variant_title: variant.title ?? undefined,
    thumbnail,
    unit_price: variant.calculated_price?.calculated_amount ?? 0,
    currency_code: variant.calculated_price?.currency_code ?? undefined,
    // A string, as every line read from the Store API carries it at runtime (the type
    // says Date): the cart page sorts lines by comparing these strings.
    created_at: new Date().toISOString() as unknown as Date,
    // `isNoDeliveryLine` reads the product's `metadata.digital`, the sidebar's stepper
    // reads the variant's stock rule.
    product: { id: product.id, metadata: product.metadata } as HttpTypes.StoreProduct,
    variant: {
      id: variant.id,
      title: variant.title,
      manage_inventory: variant.manage_inventory,
      allow_backorder: variant.allow_backorder,
      inventory_quantity: variant.inventory_quantity,
    } as HttpTypes.StoreProductVariant,
  }
}
