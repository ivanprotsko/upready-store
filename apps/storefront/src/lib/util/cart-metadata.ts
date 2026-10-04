/**
 * `cart.metadata` as it is written back (t-2026-10-04-48). Medusa replaces the
 * column whole on `POST /store/carts/:id` (`updateCarts_` in `@medusajs/cart`
 * 2.19 spreads the payload over the row, it merges nothing), and the checkout
 * writes it from three places with three sets of keys: the contacts form
 * (`contact_*`, `has_different_recipient`), the consent boxes
 * (`checkout_consent`) and the pickup point (`pickup_point_*`). Each write used
 * to drop the other two: Ivan's Robokassa test on cherkashino.ru came back
 * with `checkout_consent` alone and the contacts step open and empty.
 *
 * So a writer sends only its own keys, and `updateCart` lays them over the
 * metadata the backend holds at that moment, never over a copy a client
 * rendered earlier. A key the patch leaves `undefined` keeps its stored value.
 */
export const mergeCartMetadata = (
  current: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>
): Record<string, unknown> => {
  const merged: Record<string, unknown> = { ...(current ?? {}) }

  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      merged[key] = value
    }
  }

  return merged
}
