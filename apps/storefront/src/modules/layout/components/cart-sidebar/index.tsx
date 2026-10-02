"use client"

import { ChevronRightMini, ShoppingCart, User, XMark } from "@medusajs/icons"
import type { HttpTypes } from "@medusajs/types"
import { Button, Drawer, IconButton, Text } from "@medusajs/ui"
import { usePathname, useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { getCartDeliveryDays } from "@lib/data/cart-delivery"
import { useRouter } from "@i18n/navigation"
import { allowsEmailLogin, yandexLoginAvailable, type TenantLoginSettings } from "@lib/tenant/login-settings"
import { formatDeliveryRange } from "@lib/util/delivery-estimate"
import type { DeliveryDays } from "@lib/util/fulfillment"
import { convertToLocale } from "@lib/util/money"
import { cartShipmentLines, shipmentGroups } from "@lib/util/shipment-groups"
import YandexMark from "@modules/account/components/yandex-login/yandex-mark"

import { useCartSidebar } from "./context"
import CartSidebarLine from "./line"

/** The checkout step the cart is ready for: the cart page's own rule (`cart/templates/summary.tsx`). */
const checkoutStep = (cart: HttpTypes.StoreCart): "address" | "delivery" | "payment" => {
  if (!cart.shipping_address?.address_1 || !cart.email) return "address"
  if (cart.shipping_methods?.length === 0) return "delivery"
  return "payment"
}

/**
 * The cart as a right sidebar on desktop (batch 5, Ivan 03.10: «давай корзину сделаем на
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
 * In the frame, not here (no feature behind them): the checkbox on every line, the
 * gift icon on a line, «Через Телеграм» (the storefront has no Telegram sign-in; the
 * second button is Yandex ID when the shop offers it, `lib/tenant/login-settings.ts`).
 */
export default function CartSidebar({
  cart,
  isLoggedIn,
  wishlistLoggedIn,
  wishlistProductIds,
  loginSettings,
}: {
  cart: HttpTypes.StoreCart | null
  /** The buyer has an account session: the sign-in block is not shown. */
  isLoggedIn: boolean
  wishlistLoggedIn: boolean
  wishlistProductIds: readonly string[]
  loginSettings: TenantLoginSettings
}) {
  const t = useTranslations("CartSidebar")
  const tShip = useTranslations("Shipments")
  const tCommon = useTranslations("Common")
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname() ?? "/"
  const searchParams = useSearchParams()
  const { isOpen, setOpen, close } = useCartSidebar()

  const items = cart?.items ?? []
  const groups = shipmentGroups(cartShipmentLines(items))
  const hasPhysical = groups.some((group) => group.kind === "physical")

  // The delivery term is asked for when the sidebar opens, not on every page render
  // (`getCartDeliveryDays`: the shop's options for a cart are a `no-store` request).
  const [days, setDays] = useState<DeliveryDays | null>(null)
  const [now, setNow] = useState<Date | null>(null)
  const cartId = cart?.id ?? null
  const chosenOptionId = cart?.shipping_methods?.[0]?.shipping_option_id ?? null
  useEffect(() => {
    if (!isOpen || !cartId || !hasPhysical) return
    let cancelled = false
    setNow(new Date())
    getCartDeliveryDays(cartId, chosenOptionId)
      .then((result) => {
        if (!cancelled) setDays(result)
      })
      .catch(() => {
        if (!cancelled) setDays(null)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, cartId, chosenOptionId, hasPhysical])
  const estimate = now ? formatDeliveryRange(locale, now, days) : null

  const query = searchParams?.toString()
  const returnTo = query ? `${pathname}?${query}` : pathname
  const emailSignIn = allowsEmailLogin(loginSettings.method)
  const yandexSignIn = yandexLoginAvailable(loginSettings)
  const showSignIn = !isLoggedIn && (emailSignIn || yandexSignIn)

  const goodsTotal = cart ? (cart.item_subtotal ?? cart.subtotal ?? 0) : 0
  const currencyCode = cart?.currency_code ?? "RUB"

  return (
    <Drawer open={isOpen} onOpenChange={setOpen}>
      <Drawer.Content
        // The frame: a 360 px column pinned to the right edge, full height, flat — not
        // @medusajs/ui's floating card. `!` wins over the component's own inset/width
        // defaults regardless of Tailwind's rule order (the same device as
        // `product-details-drawer`). Hidden below 1024 px even if some state opened it.
        className="z-[80] hidden !inset-y-0 !right-0 !w-[360px] !max-w-[360px] !rounded-none border-y-0 border-r-0 !bg-ui-bg-subtle lg:flex"
        overlayProps={{ className: "z-[80]" }}
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
            <section
              className="flex flex-col gap-y-3 border-b border-dotted border-ui-border-strong px-4 py-4"
              data-testid="cart-sidebar-sign-in"
            >
              <div className="flex items-start gap-x-3">
                <Text size="small" leading="compact" className="flex-1 text-ui-fg-base">
                  {t("signInPrompt")}
                </Text>
                <User className="mt-0.5 shrink-0 text-ui-fg-muted" aria-hidden />
              </div>
              <div className="flex gap-x-3">
                {emailSignIn ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="base"
                    className="min-w-0 flex-1"
                    onClick={() => {
                      close()
                      router.push(`/account?return=${encodeURIComponent(returnTo)}`)
                    }}
                    data-testid="cart-sidebar-sign-in-email"
                  >
                    {t("signInEmail")}
                  </Button>
                ) : null}
                {yandexSignIn ? (
                  <Button
                    asChild
                    variant="secondary"
                    size="base"
                    className="min-w-0 flex-1"
                    data-testid="cart-sidebar-sign-in-yandex"
                  >
                    <a href={`/api/yandex-login?return=${encodeURIComponent(returnTo)}`}>
                      <YandexMark />
                      {t("signInYandex")}
                    </a>
                  </Button>
                ) : null}
              </div>
            </section>
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
            groups.map((group, index) => (
              <section
                key={group.key}
                className={index > 0 ? "border-t border-dotted border-ui-border-strong" : undefined}
                data-testid={`cart-sidebar-group-${group.kind}`}
                data-shipment-no={group.no ?? undefined}
              >
                <div className="flex items-baseline justify-between gap-x-3 px-4 pb-3 pt-4">
                  {group.kind === "physical" ? (
                    <>
                      <Text size="small" weight="plus" leading="compact" className="shrink-0 text-ui-fg-base">
                        {tShip("shipmentNo", { no: group.no ?? 1 })}
                      </Text>
                      {estimate ? (
                        <Text
                          size="small"
                          leading="compact"
                          className="min-w-0 truncate text-right text-ui-fg-subtle"
                          data-testid="cart-sidebar-delivery-estimate"
                        >
                          {t("deliveryEstimate", { range: estimate })}
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    <Text size="small" weight="plus" leading="compact" className="text-ui-fg-base">
                      {tShip("digitalGroup")}
                    </Text>
                  )}
                </div>
                <div className="flex flex-col gap-y-2 px-4 pb-4">
                  {group.lines.map(({ item }) => (
                    <CartSidebarLine
                      key={item.id}
                      item={item}
                      currencyCode={currencyCode}
                      wishlistLoggedIn={wishlistLoggedIn}
                      wishlistActive={
                        item.product_id ? wishlistProductIds.includes(item.product_id) : false
                      }
                    />
                  ))}
                </div>
              </section>
            ))
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
                onClick={() => {
                  close()
                  router.push(`/checkout?step=${checkoutStep(cart)}`)
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
