"use client"

import { usePathname } from "next/navigation"
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

/**
 * Tailwind's `lg` / the preset's `small`: from here the cart is the right sidebar
 * (`cart-sidebar/index.tsx`); below it the cart stays the page it is today.
 */
export const CART_SIDEBAR_QUERY = "(min-width: 1024px)"

type CartSidebarContextValue = {
  isOpen: boolean
  /**
   * Opens the sidebar on a desktop viewport and says whether it did: a caller that is
   * also a link (`CartTrigger`) keeps its navigation when this answers `false`.
   */
  open: () => boolean
  close: () => void
  setOpen: (open: boolean) => void
}

const CartSidebarContext = createContext<CartSidebarContextValue>({
  isOpen: false,
  open: () => false,
  close: () => {},
  setOpen: () => {},
})

/**
 * One open/closed state for the cart sidebar (batch 5), shared by everything under
 * `(main)/layout.tsx`: the header's «Корзина» trigger and the sidebar itself live in
 * the nav, while «В корзину» on a product page and the wishlist's add button sit deep in
 * the page and open it after a successful add. Navigation closes it — a product link
 * inside a line card, «К оформлению», the sign-in buttons.
 */
export function CartSidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  const open = useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia(CART_SIDEBAR_QUERY).matches) {
      return false
    }
    setOpen(true)
    return true
  }, [])

  const close = useCallback(() => setOpen(false), [])

  const value = useMemo(
    () => ({ isOpen, open, close, setOpen }),
    [isOpen, open, close]
  )

  return (
    <CartSidebarContext.Provider value={value}>{children}</CartSidebarContext.Provider>
  )
}

export const useCartSidebar = () => useContext(CartSidebarContext)
