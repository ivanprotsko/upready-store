"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"

import { addToCart } from "@lib/data/cart"
import { Link } from "@i18n/navigation"
import { useCartSidebar } from "@modules/layout/components/cart-sidebar/context"

type Props = {
  productHandle: string
  /** The product's one variant, when it has exactly one — a wishlist card has no option picker, so a product with a choice to make sends the buyer to the product page instead. */
  singleVariantId: string | null
}

export default function WishlistAddToCartButton({ productHandle, singleVariantId }: Props) {
  const t = useTranslations("WishlistPage")
  const [isAdding, setIsAdding] = useState(false)
  const { open: openCartSidebar } = useCartSidebar()

  if (!singleVariantId) {
    return (
      <Link
        href={`/products/${productHandle}`}
        className="inline-flex items-center justify-center rounded-medium bg-ui-button-inverted px-4 py-2 text-sm font-medium text-ui-fg-on-color transition-colors hover:bg-ui-button-inverted-hover"
        data-testid="wishlist-choose-options-link"
      >
        {t("chooseOptions")}
      </Link>
    )
  }

  const onClick = async () => {
    setIsAdding(true)
    try {
      await addToCart({ variantId: singleVariantId, quantity: 1 })
      // Batch 5: on a desktop viewport the cart sidebar opens on a successful add.
      openCartSidebar()
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isAdding}
      className="inline-flex items-center justify-center rounded-medium bg-ui-button-inverted px-4 py-2 text-sm font-medium text-ui-fg-on-color transition-colors hover:bg-ui-button-inverted-hover disabled:opacity-60"
      data-testid="wishlist-add-to-cart-button"
    >
      {t("addToCart")}
    </button>
  )
}
