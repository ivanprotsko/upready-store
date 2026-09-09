"use client"

import { createContext, useCallback, useContext, useState } from "react"

type PickupSheetContextValue = {
  isOpen: boolean
  openSheet: () => void
  closeSheet: () => void
}

const PickupSheetContext = createContext<PickupSheetContextValue>({
  isOpen: false,
  openSheet: () => {},
  closeSheet: () => {},
})

/**
 * Shared open/close state for `checkout-pickup-point-sheet` (D2 §1-§5).
 * `checkout-shipping-section` opens it the moment "Pickup" is selected with
 * no point chosen yet; `checkout-info-rows` reopens it when the chosen point
 * is tapped (frame 4) — two sibling client components under the same server
 * parent (`checkout-form`), so the open flag is lifted here rather than kept
 * local to either one, the same shape `cart-update-context` already uses.
 */
export function PickupSheetProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)

  const openSheet = useCallback(() => setIsOpen(true), [])
  const closeSheet = useCallback(() => setIsOpen(false), [])

  return (
    <PickupSheetContext.Provider value={{ isOpen, openSheet, closeSheet }}>
      {children}
    </PickupSheetContext.Provider>
  )
}

export const usePickupSheet = () => useContext(PickupSheetContext)
