"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import type { HttpTypes } from "@medusajs/types"
import { Button } from "@medusajs/ui"

import { Link } from "@i18n/navigation"
import { addToCart } from "@lib/data/cart"

/**
 * The quick add-to-bag control hero G and listing P5 need on a homepage teaser card
 * (`2026-09-09-block-port-map.md` §4/§6, both flagged "first cart-mutating hero/listing
 * content in this codebase"). Reuses `addToCart` from `lib/data/cart.ts` exactly as
 * `product-actions/index.tsx` already does — no new fetch, same cache-tag revalidation.
 *
 * A homepage card has no option selector, so this only ever adds a variant on its own:
 * a single-variant product adds directly; a product with a choice to make (size, colour)
 * instead links to its own page, carrying the same `selectOptions` wording
 * `ProductActions` already shows a visitor for that exact situation. Stock is checked
 * with the identical rule `ProductActions` uses (`product-actions/index.tsx:100-119`).
 */
export default function AddToBagButton({
  product,
  variant = "primary",
  size = "large",
  className,
}: {
  product: HttpTypes.StoreProduct
  variant?: "primary" | "secondary"
  size?: "small" | "base" | "large"
  className?: string
}) {
  const t = useTranslations()
  const [isAdding, setIsAdding] = useState(false)
  const variants = product.variants ?? []
  const onlyVariant = variants.length === 1 ? variants[0] : null

  if (!onlyVariant) {
    return (
      <Link
        href={`/products/${product.handle}`}
        data-testid="home-quick-add-select"
        className={
          "inline-flex h-10 items-center justify-center rounded-full border border-ui-border-base px-6 text-sm font-medium text-ui-fg-base transition-colors hover:bg-ui-bg-base-hover " +
          (className ?? "")
        }
      >
        {t("ProductActions.selectOptions")}
      </Link>
    )
  }

  const inStock =
    !onlyVariant.manage_inventory ||
    onlyVariant.allow_backorder ||
    (onlyVariant.inventory_quantity ?? 0) > 0

  const handleClick = async () => {
    setIsAdding(true)
    await addToCart({ variantId: onlyVariant.id, quantity: 1 })
    setIsAdding(false)
  }

  return (
    <Button
      onClick={handleClick}
      disabled={!inStock || isAdding}
      isLoading={isAdding}
      variant={variant}
      size={size}
      className={className}
      data-testid="home-quick-add-button"
    >
      {inStock ? t("ProductActions.addToCart") : t("ProductActions.outOfStock")}
    </Button>
  )
}
