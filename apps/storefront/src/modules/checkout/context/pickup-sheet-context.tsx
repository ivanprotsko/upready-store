"use client"

import { createContext, useCallback, useContext, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { setShippingMethod, updateCart } from "@lib/data/cart"
import { PICKUP_METADATA_KEYS, type PickupPoint } from "@lib/theme/composition"
import { isPickupShippingOption, toPickupPoint } from "@lib/util/fulfillment"
import { useCartUpdate } from "@modules/checkout/context/cart-update-context"
import type { HttpTypes } from "@medusajs/types"

type PickupSheetContextValue = {
  isOpen: boolean
  openSheet: () => void
  closeSheet: () => void
  points: PickupPoint[]
  selectedPointId: string | null
  choosingId: string | null
  error: string | null
  choosePoint: (point: PickupPoint) => void
}

const noop = () => {}

const PickupSheetContext = createContext<PickupSheetContextValue>({
  isOpen: false,
  openSheet: noop,
  closeSheet: noop,
  points: [],
  selectedPointId: null,
  choosingId: null,
  error: null,
  choosePoint: noop,
})

interface PickupSheetProviderProps {
  cart: HttpTypes.StoreCart
  shippingOptions: HttpTypes.StoreCartShippingOptionWithServiceZone[] | null
  children: React.ReactNode
}

/**
 * Shared pickup-point state for the checkout's "Pickup" shipping method
 * (D2 §1-§5). `checkout-shipping-section` and `checkout-info-rows` are
 * siblings under the same server parent (`checkout-form`) that both need to
 * open the sheet; this provider also owns the point list itself and the
 * one function that changes the cart, so neither sibling nor the sheet
 * duplicates that logic:
 *
 * - `points` — derived from the pickup-typed shipping options already
 *   fetched for this page (`toPickupPoint`, `lib/util/fulfillment.ts`), not
 *   a second request. Each pickup point is its OWN shipping option — a
 *   `fulfillment_set` links 1:1 to a stock location, so N points seed N
 *   options, all sharing one `code`/`name` ("pickup"/"Pickup") — see
 *   `seedFulfillment()`'s own doc comment
 *   (`apps/backend/src/migration-scripts/lib/fulfillment.ts`).
 * - `choosePoint` — calls `setShippingMethod` with that point's own option
 *   id (what actually puts the cart on that fulfillment path), blanks the
 *   now-irrelevant delivery address the same way `checkout-shipping-
 *   section` already did before this provider existed, then stamps
 *   `cart.metadata` with the point's display identity
 *   (`PICKUP_METADATA_KEYS`, `composition.ts`) so `checkout-info-rows` and
 *   `checkout-pickup-summary` can echo it without looking the option back
 *   up.
 */
export function PickupSheetProvider({
  cart,
  shippingOptions,
  children,
}: PickupSheetProviderProps) {
  const router = useRouter()
  const { trackCartUpdate } = useCartUpdate()
  const [isOpen, setIsOpen] = useState(false)
  const [choosingId, setChoosingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const points = useMemo(
    () =>
      (shippingOptions ?? [])
        .filter((option) => isPickupShippingOption(option))
        .map(toPickupPoint),
    [shippingOptions]
  )

  const meta = cart.metadata as Record<string, string> | null
  const selectedPointId = meta?.[PICKUP_METADATA_KEYS.id] ?? null

  const openSheet = useCallback(() => {
    setError(null)
    setIsOpen(true)
  }, [])
  const closeSheet = useCallback(() => setIsOpen(false), [])

  const choosePoint = useCallback(
    async (point: PickupPoint) => {
      setChoosingId(point.id)
      setError(null)

      const shippingErr = await trackCartUpdate(() =>
        setShippingMethod({ cartId: cart.id, shippingMethodId: point.id })
      ).catch((e: Error) => e.message)

      if (shippingErr) {
        setChoosingId(null)
        setError(shippingErr as string)
        return
      }

      const addr = cart.shipping_address
      const hasDeliveryFields = !!(
        addr?.address_1 ||
        addr?.address_2 ||
        addr?.city ||
        addr?.postal_code ||
        addr?.province ||
        addr?.company
      )

      if (hasDeliveryFields) {
        await trackCartUpdate(() =>
          updateCart({
            shipping_address: {
              first_name: addr?.first_name || "",
              last_name: addr?.last_name || "",
              phone: addr?.phone || "",
              country_code: addr?.country_code || "",
              company: "",
              address_1: "",
              address_2: "",
              city: "",
              postal_code: "",
              province: "",
            },
          } as HttpTypes.StoreUpdateCart)
        ).catch(() => {
          // Best-effort: an address that fails to blank is not worth
          // blocking the point choice over — `checkout-info-rows` already
          // hides the address row entirely once `isPickupShippingOption` is
          // true, regardless of what the field still holds server-side.
        })
      }

      const addressText = [...point.addressLines, point.city]
        .filter(Boolean)
        .join(", ")

      const metaErr = await trackCartUpdate(() =>
        updateCart({
          metadata: {
            [PICKUP_METADATA_KEYS.id]: point.id,
            [PICKUP_METADATA_KEYS.name]: point.name,
            [PICKUP_METADATA_KEYS.address]: addressText,
            [PICKUP_METADATA_KEYS.hours]: point.openingHours ?? "",
          },
        } as HttpTypes.StoreUpdateCart)
      )
        .then(() => null)
        .catch((e: Error) => e.message)

      setChoosingId(null)

      if (metaErr) {
        setError(metaErr)
        return
      }

      setIsOpen(false)
      router.refresh()
    },
    [cart.id, cart.shipping_address, router, trackCartUpdate]
  )

  return (
    <PickupSheetContext.Provider
      value={{
        isOpen,
        openSheet,
        closeSheet,
        points,
        selectedPointId,
        choosingId,
        error,
        choosePoint,
      }}
    >
      {children}
    </PickupSheetContext.Provider>
  )
}

export const usePickupSheet = () => useContext(PickupSheetContext)
