"use client"

import { useTranslations } from "next-intl"

import { useCartQueue } from "@lib/cart-store"
import { Link } from "@i18n/navigation"
import { useCartSidebar } from "@modules/layout/components/cart-sidebar/context"

type Props = {
  productHandle: string
  /** The product's one variant, when it has exactly one — a wishlist card has no option picker, so a product with a choice to make sends the buyer to the product page instead. */
  singleVariantId: string | null
}

export default function WishlistAddToCartButton({ productHandle, singleVariantId }: Props) {
  const t = useTranslations("WishlistPage")
  const queue = useCartQueue()
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

  // Through the client cart queue (t-2026-10-03-66), sent at once rather than after the
  // debounce: a wishlist card knows no price, so the queue cannot draw the line before the
  // server answers with it, and there is no burst of clicks to wait for here.
  const onClick = () => {
    queue.add(singleVariantId, 1)
    queue.flush()
    // Batch 5: on a desktop viewport the cart sidebar opens on the add.
    openCartSidebar()
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center rounded-medium bg-ui-button-inverted px-4 py-2 text-sm font-medium text-ui-fg-on-color transition-colors hover:bg-ui-button-inverted-hover disabled:opacity-60"
      data-testid="wishlist-add-to-cart-button"
    >
      {t("addToCart")}
    </button>
  )
}
