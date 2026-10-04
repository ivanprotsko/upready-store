"use client"

import type { HttpTypes } from "@medusajs/types"
import { Text } from "@medusajs/ui"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { getCartDeliveryDays } from "@lib/data/cart-delivery"
import { formatDeliveryRange } from "@lib/util/delivery-estimate"
import type { DeliveryDays } from "@lib/util/fulfillment"
import { cartShipmentLines, shipmentGroups } from "@lib/util/shipment-groups"

import CartSidebarLine from "./line"

/**
 * The delivery term next to «Отправление № N», asked for only while `active` (the sidebar:
 * while it is open) and only for a cart with something to ship (`getCartDeliveryDays`: the
 * shop's options for a cart are a `no-store` request, too dear for every page render).
 */
export function useCartDeliveryEstimate(
  cart: HttpTypes.StoreCart | null | undefined,
  active: boolean
): string | null {
  const locale = useLocale()
  const [days, setDays] = useState<DeliveryDays | null>(null)
  const [now, setNow] = useState<Date | null>(null)
  const cartId = cart?.id ?? null
  const chosenOptionId = cart?.shipping_methods?.[0]?.shipping_option_id ?? null
  const hasPhysical = shipmentGroups(cartShipmentLines(cart?.items ?? [])).some(
    (group) => group.kind === "physical"
  )
  useEffect(() => {
    if (!active || !cartId || !hasPhysical) return
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
  }, [active, cartId, chosenOptionId, hasPhysical])
  return now ? formatDeliveryRange(locale, now, days) : null
}

/**
 * The cart's lines grouped by shipment, as the sidebar draws them (Figma frame 3:60739):
 * «Отправление № N» with the delivery estimate, the online course in its own group, and
 * every line a white `CartSidebarLine` card. The sidebar and the cart page both draw
 * this (t-2026-10-04-42, Ivan 04.10: «на странице корзины нужно обернуть карточки
 * товаров и стилизовать их точно также как в которая отображается сайдбаре»), each on
 * the sidebar's own grey, `--cart-sidebar-bg`.
 */
export default function CartLineGroups({
  items,
  currencyCode,
  estimate,
  wishlistLoggedIn,
  wishlistProductIds,
}: {
  items: HttpTypes.StoreCartLineItem[]
  currencyCode: string
  estimate: string | null
  wishlistLoggedIn: boolean
  wishlistProductIds: readonly string[]
}) {
  const t = useTranslations("CartSidebar")
  const tShip = useTranslations("Shipments")
  const groups = shipmentGroups(cartShipmentLines(items))

  return (
    <>
      {groups.map((group, index) => (
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
                // By variant: a first add is drawn before the server names its line,
                // and the card must not remount when the real id arrives.
                key={item.variant_id ?? item.id}
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
      ))}
    </>
  )
}
