"use client"

import type { HttpTypes } from "@medusajs/types"
import { useTranslations } from "next-intl"

import { cartShipmentLines, shipmentGroups } from "@lib/util/shipment-groups"
import { useCartDeliveryEstimate } from "@modules/layout/components/cart-sidebar/groups"

import CartLine, { CART_ROW_COLUMNS } from "../components/cart-line"

type ItemsTemplateProps = {
  cart: HttpTypes.StoreCart
  /** Whether the hearts write to the account (signed in) or to this browser (a guest). */
  wishlistLoggedIn: boolean
  /** The signed-in buyer's wishlist, as the server rendered it. */
  wishlistProductIds: readonly string[]
}

/**
 * The cart page's lines as a light table (t-2026-10-06-11, Ivan 06.10: «На скриншотах
 * обрати внимание на сбаланисрованость»): column captions, hairline dividers and no
 * panel, so the list weighs the same as the summary card beside it. This replaces the
 * sidebar's grey panel of white cards the page drew since t-2026-10-04-42. The lines
 * are still grouped by shipment with the sidebar's captions and its delivery estimate,
 * asked for once, when the page is on screen.
 */
const ItemsTemplate = ({
  cart,
  wishlistLoggedIn,
  wishlistProductIds,
}: ItemsTemplateProps) => {
  const t = useTranslations("Cart")
  const tSidebar = useTranslations("CartSidebar")
  const tShip = useTranslations("Shipments")
  const estimate = useCartDeliveryEstimate(cart, true)
  const groups = shipmentGroups(cartShipmentLines(cart.items ?? []))

  return (
    <div
      className="border-t border-ui-border-base md:border-t-0"
      data-testid="items-table"
    >
      <div
        className={`txt-compact-small hidden border-b border-ui-border-base pb-3 text-ui-fg-subtle md:grid ${CART_ROW_COLUMNS}`}
        data-testid="cart-columns"
      >
        <span className="col-span-2">{t("columnProduct")}</span>
        <span className="text-end">{t("columnPrice")}</span>
        <span className="text-center">{t("columnQuantity")}</span>
        <span className="text-end">{t("columnTotal")}</span>
        <span />
      </div>

      {groups.map((group) => (
        <section
          key={group.key}
          data-testid={`cart-sidebar-group-${group.kind}`}
          data-shipment-no={group.no ?? undefined}
        >
          <div className="txt-compact-small flex items-baseline justify-between gap-x-3 pt-4">
            {group.kind === "physical" ? (
              <>
                <span className="shrink-0 font-medium text-ui-fg-base">
                  {tShip("shipmentNo", { no: group.no ?? 1 })}
                </span>
                {estimate ? (
                  <span
                    className="min-w-0 truncate text-end text-ui-fg-subtle"
                    data-testid="cart-sidebar-delivery-estimate"
                  >
                    {tSidebar("deliveryEstimate", { range: estimate })}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="font-medium text-ui-fg-base">{tShip("digitalGroup")}</span>
            )}
          </div>
          {group.lines.map(({ item }) => (
            <CartLine
              // By variant: a first add is drawn before the server names its line,
              // and the row must not remount when the real id arrives.
              key={item.variant_id ?? item.id}
              item={item}
              currencyCode={cart.currency_code}
              wishlistLoggedIn={wishlistLoggedIn}
              wishlistActive={
                item.product_id ? wishlistProductIds.includes(item.product_id) : false
              }
            />
          ))}
        </section>
      ))}
    </div>
  )
}

export default ItemsTemplate
