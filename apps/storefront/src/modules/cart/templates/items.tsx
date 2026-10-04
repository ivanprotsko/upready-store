"use client"

import type { HttpTypes } from "@medusajs/types"
import { useTranslations } from "next-intl"

import CartLineGroups, {
  useCartDeliveryEstimate,
} from "@modules/layout/components/cart-sidebar/groups"

type ItemsTemplateProps = {
  cart: HttpTypes.StoreCart
  /** Whether the hearts write to the account (signed in) or to this browser (a guest). */
  wishlistLoggedIn: boolean
  /** The signed-in buyer's wishlist, as the server rendered it. */
  wishlistProductIds: readonly string[]
}

/**
 * The cart page's lines, wrapped and drawn as the cart sidebar draws them
 * (t-2026-10-04-42, Ivan 04.10: «на странице корзины нужно обернуть карточки товаров и
 * стилизовать их точно также как в которая отображается сайдбаре»). The shipment groups
 * sit on the sidebar's own grey, and every line is the sidebar's white card with its
 * heart and «− N +» stepper. «−» on the last one removes the line, so the card needs no
 * separate remove control here either. The delivery estimate is asked for once, when the
 * page is on screen.
 */
const ItemsTemplate = ({
  cart,
  wishlistLoggedIn,
  wishlistProductIds,
}: ItemsTemplateProps) => {
  const t = useTranslations("Cart")
  const estimate = useCartDeliveryEstimate(cart, true)

  return (
    <div>
      <h1 className="text-[2rem] leading-[2.25rem] font-medium mb-8">
        {t("heading")}
      </h1>

      <div
        className="overflow-hidden rounded-lg bg-[var(--cart-sidebar-bg)]"
        data-testid="items-table"
      >
        <CartLineGroups
          items={cart.items ?? []}
          currencyCode={cart.currency_code}
          estimate={estimate}
          wishlistLoggedIn={wishlistLoggedIn}
          wishlistProductIds={wishlistProductIds}
        />
      </div>
    </div>
  )
}

export default ItemsTemplate
