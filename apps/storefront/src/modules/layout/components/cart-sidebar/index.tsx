"use client"

import { ChevronRightMini, ShoppingCart, XMark } from "@medusajs/icons"
import type { HttpTypes } from "@medusajs/types"
import { Button, clx, Drawer, IconButton, Text } from "@medusajs/ui"
import { usePathname, useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useLayoutEffect, useRef, useState } from "react"

import { useCart, type CartSnapshot } from "@lib/cart-store"
import type { TelegramBot } from "@lib/data/telegram-bot"
import { useRouter } from "@i18n/navigation"
import { allowsEmailLogin, yandexLoginAvailable, type TenantLoginSettings } from "@lib/tenant/login-settings"
import type { LegalLinkContext } from "@lib/util/legal-links"
import { convertToLocale } from "@lib/util/money"
import { cartShipmentLines, shipmentGroups } from "@lib/util/shipment-groups"

import { useCartSidebar } from "./context"
import CartLineGroups, { useCartDeliveryEstimate } from "./groups"
import CartSidebarSignIn from "./sign-in"

/** The checkout step the cart is ready for: the cart page's own rule (`cart/templates/summary.tsx`). */
const checkoutStep = (cart: HttpTypes.StoreCart): "address" | "delivery" | "payment" => {
  if (!cart.shipping_address?.address_1 || !cart.email) return "address"
  if (cart.shipping_methods?.length === 0) return "delivery"
  return "payment"
}

/**
 * The edge the panel is pinned to and slides from. Figma frame 3:60739 "Sidebar" has it on
 * the right, and so does the shop (t-2026-10-04-15, Ivan 04.10: «в ходе недавних изменений в
 * сайдбаре его сделали слева, а он должен быть справа»). Commit b5fdb6a1 (PR #232,
 * t-2026-10-03-63) had moved it to the left; this one constant drives both the pin and the
 * slide direction, and `cart-sidebar-side.test.ts` pins it so it cannot drift again.
 * `as` (not a `: "left" | "right"` annotation) keeps the type a union: an annotated const
 * is narrowed to its initializer, and the `SIDE === "left"` branch below then fails tsc
 * with TS2367 (caught by CI on PR #238).
 */
export const CART_SIDEBAR_SIDE = "right" as "left" | "right"
const SIDE = CART_SIDEBAR_SIDE

/**
 * Overlay fade and panel slide share this one duration, t-2026-10-03-63 bullet 2 («то же
 * время, что и сдвиг панели»). `!` because tailwindcss-animate's
 * `data-[state=open]:animate-in` sets its own 150 ms with a more specific selector than
 * any plain `duration-*`, so @medusajs/ui's own `duration-200` never applied (measured
 * 0.15 s on both before this change).
 */
const MOTION_DURATION = "!duration-200"

/**
 * The cart as a sidebar on desktop (batch 5, Ivan 03.10: «давай корзину сделаем на
 * десктопе в сайдбаре как здесь», Figma frame 3:60739 «Sidebar», 360×960): the page stays
 * where it is under the overlay, the sidebar holds «Корзина», the guest sign-in block,
 * the lines grouped by shipment («Отправление № N» with the delivery estimate, the
 * online course in its own group), and the footer with the goods total and
 * «К оформлению». Below 1024 px it never opens — the cart stays the page.
 *
 * Opened by `CartTrigger` in the header and by a successful «В корзину»
 * (`use-product-purchase.ts`, the wishlist's add button); Esc, the overlay, the X and
 * any navigation close it (`./context.tsx`). @medusajs/ui's `Drawer` (Radix Dialog)
 * traps focus and returns it to where it was.
 *
 * The lines, their quantities and the total are the client cart queue's
 * (t-2026-10-03-66): a «+» here or a «В корзину» on the page shows at once, and the total
 * is an estimate until the server answers with its own. «К оформлению» waits for the
 * queue to empty first, so the checkout never opens on a cart the server has not got.
 *
 * In the frame, not here (no feature behind it): the checkbox on every line, the
 * gift icon on a line. The sign-in block (`./sign-in.tsx`) offers e-mail, with its
 * forms in place, Yandex ID and Telegram per the shop's own settings
 * (`lib/tenant/login-settings.ts`, `lib/data/telegram-bot.ts`).
 */
export default function CartSidebar({
  snapshot,
  isLoggedIn,
  wishlistLoggedIn,
  wishlistProductIds,
  loginSettings,
  telegramBot,
  siteName,
  legal,
}: {
  /** The cart as the server render read it, shown until the queue has its own. */
  snapshot: CartSnapshot | null
  /** The buyer has an account session: the sign-in block is not shown. */
  isLoggedIn: boolean
  wishlistLoggedIn: boolean
  wishlistProductIds: readonly string[]
  loginSettings: TenantLoginSettings
  /** This shop's own Telegram bot, or null when it has none (`getTelegramBot`). */
  telegramBot: TelegramBot | null
  /** For the sign-up form's consent sentence, as on the account page (rule 19g). */
  siteName: string
  legal: LegalLinkContext
}) {
  const t = useTranslations("CartSidebar")
  const tCommon = useTranslations("Common")
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname() ?? "/"
  const searchParams = useSearchParams()
  const { isOpen, setOpen, close } = useCartSidebar()
  const { cart, queue } = useCart(snapshot)
  const [leaving, setLeaving] = useState(false)

  // Where focus goes back on close (t-2026-10-03-63 bullet 5). Radix returns it to a
  // `Dialog.Trigger`, and this drawer has none: the header's `CartTrigger` and «В корзину»
  // open it through the context. Measured on the stand before this change: Esc, the
  // overlay and the X all left focus on <body>. So the element focused at the moment of
  // opening is kept here, read in a layout effect, before Radix's own focus scope moves
  // focus into the panel; the header's cart button stands in when nothing was focused
  // (a click on a link focuses nothing in Safari) or that element has left the page.
  const returnFocusRef = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (!isOpen) return
    const active = document.activeElement
    returnFocusRef.current = active instanceof HTMLElement && active !== document.body ? active : null
  }, [isOpen])
  const restoreFocus = (event: Event) => {
    event.preventDefault()
    const opener = returnFocusRef.current
    const target =
      opener && opener.isConnected
        ? opener
        : Array.from(document.querySelectorAll<HTMLElement>("[data-cart-trigger]")).find(
            (trigger) => trigger.offsetParent !== null
          )
    target?.focus({ preventScroll: true })
  }

  const items = cart?.items ?? []
  const groups = shipmentGroups(cartShipmentLines(items))

  // The delivery term is asked for when the sidebar opens, not on every page render.
  const estimate = useCartDeliveryEstimate(cart, isOpen)

  const query = searchParams?.toString()
  const returnTo = query ? `${pathname}?${query}` : pathname
  const showSignIn =
    !isLoggedIn &&
    (allowsEmailLogin(loginSettings.method) || yandexLoginAvailable(loginSettings) || telegramBot !== null)

  const goodsTotal = cart ? (cart.item_subtotal ?? cart.subtotal ?? 0) : 0
  const currencyCode = cart?.currency_code ?? "RUB"

  return (
    <Drawer open={isOpen} onOpenChange={setOpen}>
      <Drawer.Content
        // A 360 px column pinned to SIDE, full height, flat — not @medusajs/ui's floating
        // card. `!` wins over the component's own inset/width/slide-direction defaults
        // regardless of Tailwind's rule order (the same device as `product-details-drawer`).
        // Width, height and inset never carry a `data-[state=…]` prefix, and the keyframes
        // only translate (the 0.9 zoom that used to replace them is gone, see
        // `tailwind.config.js`), so the panel is the same size on every frame and slides
        // its whole width in from its edge and back out (t-2026-10-03-63 bullets 1 and 3).
        // It stays opaque throughout (`fade-*-100` over the component's `fade-*-0`); the
        // overlay is what fades. `motion-reduce:!animate-none` drops both to an instant
        // cut (bullet 5); Radix's Presence reads `animationName` to time the unmount and
        // is fine with "none" on either side. Hidden below 1024 px even if some state
        // opened it.
        className={clx(
          "z-[80] hidden !inset-y-0 !w-[360px] !max-w-[360px] !rounded-none !bg-[var(--cart-sidebar-bg)] motion-reduce:!animate-none lg:flex",
          "data-[state=open]:!fade-in-100 data-[state=closed]:!fade-out-100",
          MOTION_DURATION,
          SIDE === "left"
            ? "!left-0 !right-auto border-y-0 border-l-0 data-[state=open]:!slide-in-from-left-full data-[state=closed]:!slide-out-to-left-full"
            : "!right-0 !left-auto border-y-0 border-r-0 data-[state=open]:!slide-in-from-right-full data-[state=closed]:!slide-out-to-right-full"
        )}
        overlayProps={{ className: clx("z-[80] motion-reduce:!animate-none", MOTION_DURATION) }}
        onCloseAutoFocus={restoreFocus}
        aria-describedby={undefined}
        data-testid="cart-sidebar"
      >
        <div className="flex shrink-0 items-center justify-between gap-x-2 border-b border-ui-border-base py-3 pl-4 pr-2">
          <Drawer.Title className="txt-compact-large-plus text-ui-fg-base">
            {t("title")}
          </Drawer.Title>
          <Drawer.Close asChild>
            <IconButton
              type="button"
              variant="transparent"
              size="small"
              aria-label={tCommon("close")}
              data-testid="cart-sidebar-close"
            >
              <XMark />
            </IconButton>
          </Drawer.Close>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain" data-testid="cart-sidebar-body">
          {showSignIn ? (
            <CartSidebarSignIn
              loginSettings={loginSettings}
              telegramBot={telegramBot}
              returnTo={returnTo}
              siteName={siteName}
              legal={legal}
            />
          ) : null}

          {groups.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-y-4 px-4 py-16" data-testid="cart-sidebar-empty">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ui-bg-component text-ui-fg-muted">
                <ShoppingCart />
              </span>
              <Text size="small" className="text-center text-ui-fg-subtle">
                {t("empty")}
              </Text>
              <Button
                type="button"
                variant="secondary"
                size="base"
                onClick={() => {
                  close()
                  router.push("/store")
                }}
                data-testid="cart-sidebar-explore"
              >
                {t("exploreProducts")}
              </Button>
            </div>
          ) : (
            <CartLineGroups
              items={items}
              currencyCode={currencyCode}
              estimate={estimate}
              wishlistLoggedIn={wishlistLoggedIn}
              wishlistProductIds={wishlistProductIds}
            />
          )}
        </div>

        {cart && groups.length > 0 ? (
          <div className="shrink-0 border-t border-ui-border-base" data-testid="cart-sidebar-footer">
            <div className="flex items-center justify-between gap-x-3 px-4 py-3">
              <span className="flex items-center gap-x-2 text-ui-fg-subtle">
                <ShoppingCart className="shrink-0" aria-hidden />
                <Text as="span" size="small" leading="compact" className="text-ui-fg-base">
                  {t("itemsTotal")}
                </Text>
              </span>
              <span
                className="txt-compact-medium-plus text-ui-fg-base"
                data-testid="cart-subtotal"
                data-value={goodsTotal}
              >
                {convertToLocale({ amount: goodsTotal, currency_code: currencyCode, locale })}
              </span>
            </div>
            <div className="px-4 pb-4">
              <Button
                type="button"
                variant="primary"
                size="base"
                className="w-full"
                isLoading={leaving}
                onClick={async () => {
                  setLeaving(true)
                  const { ok } = await queue.settle()
                  setLeaving(false)
                  // A refused line is back at the server's quantity and says why; the
                  // buyer sees that before going on.
                  const confirmed = queue.getState().server
                  if (!ok || !confirmed) return
                  close()
                  router.push(`/checkout?step=${checkoutStep(confirmed)}`)
                }}
                data-testid="cart-sidebar-checkout"
              >
                <span className="flex-1 text-center">{t("checkout")}</span>
                <ChevronRightMini className="shrink-0 rtl:rotate-180" aria-hidden />
              </Button>
            </div>
          </div>
        ) : null}
      </Drawer.Content>
    </Drawer>
  )
}
