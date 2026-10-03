import { getTranslations } from "next-intl/server"

import type { WishlistItem } from "@lib/data/wishlist"
import { Link } from "@i18n/navigation"
import ProductMedia from "@modules/products/components/product-media"

import WishlistAddToCartButton from "./add-to-cart-button"
import WishlistRemoveButton from "./remove-button"

/**
 * «Избранное» dashboard cards (t-cherk-32): one per saved product, newest
 * first (the backend's own order). `product` is null only if it was deleted
 * after it was saved — the card still shows the save date and the remove
 * button, just no thumbnail, title or "В корзину" (rule 20a).
 */
export default async function WishlistList({ items }: { items: WishlistItem[] }) {
  const t = await getTranslations("WishlistPage")

  return (
    <ul className="flex flex-col gap-y-4 w-full" data-testid="wishlist-list">
      {items.map((item) => {
        const { product } = item
        const href = product?.handle ? `/products/${product.handle}` : null

        return (
          <li
            key={item.product_id}
            className="flex items-center gap-x-4 border border-ui-border-base bg-ui-bg-base rounded-large p-4"
            data-testid="wishlist-card"
          >
            {href ? (
              <Link href={href} className="shrink-0">
                <ProductMedia
                  src={product!.thumbnail}
                  alt={product!.title}
                  context="line"
                  className="w-[72px]"
                />
              </Link>
            ) : (
              <div className="w-[72px]" aria-hidden />
            )}

            <div className="flex min-w-0 flex-1 flex-col gap-y-1">
              {href ? (
                <Link
                  href={href}
                  className="truncate text-base font-medium text-ui-fg-base hover:underline"
                  data-testid="wishlist-card-title"
                >
                  {product!.title}
                </Link>
              ) : (
                <span className="text-base text-ui-fg-subtle">{t("empty")}</span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-x-4">
              {href && product && (
                <WishlistAddToCartButton
                  productHandle={product.handle as string}
                  singleVariantId={
                    product.variant_ids.length === 1 ? product.variant_ids[0] : null
                  }
                />
              )}
              <WishlistRemoveButton productId={item.product_id} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
