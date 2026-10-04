"use client"

import type { ReactNode } from "react"

import { useCart, type CartSnapshot } from "@lib/cart-store"

import ItemsTemplate from "./items"
import Summary from "./summary"

/**
 * The cart page's lines and summary, read from the client cart queue: the server's
 * cart with the buyer's pending changes over it. A line removed here leaves at once;
 * the last one leaves the server-rendered `empty` message in its place.
 */
export default function CartContent({
  snapshot,
  empty,
  wishlistLoggedIn,
  wishlistProductIds,
}: {
  snapshot: CartSnapshot
  empty: ReactNode
  wishlistLoggedIn: boolean
  wishlistProductIds: readonly string[]
}) {
  const { cart } = useCart(snapshot)

  if (!cart?.items?.length) {
    return <div>{empty}</div>
  }

  return (
    <div className="grid grid-cols-1 small:grid-cols-[7fr_5fr] min-h-[70vh] gap-x-20">
      <div className="flex flex-col py-6 gap-y-6">
        <ItemsTemplate
          cart={cart}
          wishlistLoggedIn={wishlistLoggedIn}
          wishlistProductIds={wishlistProductIds}
        />
      </div>
      <div className="relative">
        <div className="h-full flex flex-col py-6 gap-y-8">
          <div className="sticky top-0">
            {cart.region && <Summary cart={cart} />}
          </div>
        </div>
      </div>
    </div>
  )
}
