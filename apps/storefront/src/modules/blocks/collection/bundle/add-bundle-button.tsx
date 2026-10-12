"use client"

import type { HttpTypes } from "@medusajs/types"

import { useCartQueue } from "@lib/cart-store"
import { draftLineFor } from "@lib/cart-store/draft"
import { useCartSidebar } from "@modules/layout/components/cart-sidebar/context"

/** One product the button adds: what `draftLineFor` reads of it and of its one variant. */
export type BundleLine = {
  product: Pick<HttpTypes.StoreProduct, "id" | "title" | "handle" | "thumbnail" | "metadata"> & {
    images?: { url: string }[] | null
  }
  variant: Pick<
    HttpTypes.StoreProductVariant,
    "id" | "title" | "calculated_price" | "manage_inventory" | "allow_backorder" | "inventory_quantity"
  >
}

/**
 * «Добавить набор»: one add per product through the client cart queue, the path of «В корзину» on the
 * product page (`use-product-purchase.ts`), and then what that button does next: the header's count
 * moves on the click, and from 1024 px the cart sidebar opens with the lines in it. The queue sends the
 * adds to `addToCart` itself; nothing here changes either.
 */
export default function AddBundleButton({
  lines,
  label,
  disabled,
  describedBy,
  className,
}: {
  lines: BundleLine[]
  label: string
  disabled: boolean
  describedBy?: string
  className: string
}) {
  const queue = useCartQueue()
  const { open: openCartSidebar } = useCartSidebar()

  const onClick = () => {
    for (const { product, variant } of lines) {
      queue.add(
        variant.id,
        1,
        draftLineFor(product as HttpTypes.StoreProduct, variant as HttpTypes.StoreProductVariant)
      )
    }
    openCartSidebar()
  }

  return (
    <button
      type="button"
      data-role="cta-primary"
      onClick={onClick}
      disabled={disabled}
      aria-describedby={describedBy}
      className={className}
    >
      {label}
    </button>
  )
}
