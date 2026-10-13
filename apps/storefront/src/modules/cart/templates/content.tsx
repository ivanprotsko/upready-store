"use client"

import type { ReactNode } from "react"
import { useTranslations } from "next-intl"

import { useCart, type CartSnapshot } from "@lib/cart-store"

import ItemsTemplate from "./items"
import Summary from "./summary"

/**
 * The cart page's lines and summary, read from the client cart queue: the server's
 * cart with the buyer's pending changes over it. A line removed here leaves at once;
 * the last one leaves the server-rendered `empty` message in its place.
 *
 * The title sits above both columns, and the list and the summary card start on one
 * line (t-2026-10-06-11). The columns are about 60 / 40 from 1280 px; at 1024 px the
 * summary keeps a fixed 360 px so the table's columns still fit.
 */
export default function CartContent({
  snapshot,
  empty,
  wishlistLoggedIn,
  wishlistProductIds,
  promoCode,
}: {
  snapshot: CartSnapshot
  empty: ReactNode
  wishlistLoggedIn: boolean
  wishlistProductIds: readonly string[]
  promoCode: boolean
}) {
  const t = useTranslations("Cart")
  const { cart } = useCart(snapshot)

  if (!cart?.items?.length) {
    return <div>{empty}</div>
  }

  return (
    <div className="min-h-[70vh] py-6">
      <h1 className="mb-6 text-[2rem] font-medium leading-[2.25rem] small:mb-8">
        {t("heading")}
      </h1>
      <div className="grid grid-cols-1 items-start gap-y-8 small:grid-cols-[minmax(0,1fr)_22.5rem] small:gap-x-8 medium:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] medium:gap-x-16">
        <ItemsTemplate
          cart={cart}
          wishlistLoggedIn={wishlistLoggedIn}
          wishlistProductIds={wishlistProductIds}
        />
        {cart.region && (
          <div className="small:sticky small:top-6">
            <Summary cart={cart} promoCode={promoCode} />
          </div>
        )}
      </div>
    </div>
  )
}
