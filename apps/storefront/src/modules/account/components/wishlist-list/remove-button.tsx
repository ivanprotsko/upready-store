"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"

import { removeWishlistItem } from "@lib/data/wishlist"
import Trash from "@modules/common/icons/trash"

/** The account page's own remove action — `WishlistButton` toggles the same row from the card and the product page, this one only ever removes. */
export default function WishlistRemoveButton({ productId }: { productId: string }) {
  const t = useTranslations("WishlistPage")
  const [pending, setPending] = useState(false)

  const onClick = async () => {
    setPending(true)
    try {
      await removeWishlistItem(productId)
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-x-1.5 text-sm text-ui-fg-subtle transition-colors hover:text-ui-fg-base disabled:opacity-60"
      data-testid="wishlist-remove-button"
    >
      <Trash />
      {t("remove")}
    </button>
  )
}
