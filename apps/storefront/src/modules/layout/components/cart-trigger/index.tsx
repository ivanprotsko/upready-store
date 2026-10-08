"use client"

import { ShoppingCart } from "@medusajs/icons"
import { useTranslations } from "next-intl"

import { useCart, type CartSnapshot } from "@lib/cart-store"

import { Link } from "@i18n/navigation"
import { useCartSidebar } from "@modules/layout/components/cart-sidebar/context"

/**
 * The header's cart control (batch 5, Ivan's Figma frame 3:60739). On a desktop
 * viewport it opens the cart sidebar; below 1024 px, and with no JavaScript, it is the
 * link to the cart page it always was. The badge with the count stays on the icon.
 *
 * `"text"` (the Olavka h7 header): cart icon + «Корзина» in a 40px button with no fill,
 * the `ToggleButton` of Ivan's frame CatalogNav (176:166085, padding 0 16, gap 6;
 * t-2026-10-09-41, before it the white pill of node 227:9557). The header's scrolled state
 * gives it its surface. Default: the bare icon every other header and the phone's bottom
 * nav use.
 *
 * The count is the client cart queue's (t-2026-10-03-66): it moves the moment a
 * «В корзину» or a «+» is clicked anywhere on the page, before the server has answered.
 * `snapshot` is the server's read, shown until the queue has a cart of its own.
 */
export default function CartTrigger({
  snapshot,
  variant = "icon",
}: {
  snapshot?: CartSnapshot | null
  variant?: "icon" | "text"
}) {
  const t = useTranslations("CartSidebar")
  const tNav = useTranslations("Nav")
  const { open } = useCartSidebar()
  const { cart, pending } = useCart(snapshot)

  const totalItems =
    cart?.items?.reduce((acc, item) => acc + item.quantity, 0) || 0

  return (
    <Link
      href="/cart"
      className={
        variant === "text"
          ? "inline-flex h-10 items-center gap-x-1.5 rounded-full px-4 font-[family-name:var(--font-olavka-ui)] text-[14px] font-medium leading-[1.1] text-[var(--h7-ink,var(--foreground))] transition-colors hover:bg-[var(--accent)] focus-visible:rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          : "flex h-full items-center hover:text-ui-fg-base"
      }
      aria-label={tNav("cart", { count: totalItems })}
      onClick={(event) => {
        if (open()) {
          event.preventDefault()
        }
      }}
      // Where the cart sidebar sends focus back on close when nothing else was focused.
      data-cart-trigger=""
      // Something is still on its way to the server: suites wait on this.
      data-pending={pending ? "true" : undefined}
      data-testid="nav-cart-link"
    >
      <span className="relative flex items-center leading-none">
        <ShoppingCart className={variant === "text" ? "h-[15px] w-[15px]" : undefined} />
        {totalItems > 0 && (
          <span
            className="absolute -top-2 -right-2 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-ui-contrast-bg-base text-ui-contrast-fg-primary text-[10px] font-medium leading-none"
            data-testid="cart-item-count"
          >
            {totalItems}
          </span>
        )}
      </span>
      {variant === "text" ? <span className="hidden sm:inline">{t("title")}</span> : null}
    </Link>
  )
}
