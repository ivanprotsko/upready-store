"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, type ReactNode } from "react"

import { useCartState } from "@lib/cart-store"

/**
 * The checkout's `<main>`, closed while the client cart queue still has changes on
 * their way to the server (t-2026-10-03-66, the brief: «пока очередь не пуста,
 * оформление заказа недоступно»).
 *
 * Every way into the checkout the storefront offers («К оформлению», «Оформить заказ»,
 * «Купить») waits for the queue first, so this shows only after a full navigation: an
 * address typed in, or a reload, while a click was still pending. The page was then
 * rendered from the cart without it; the queue re-sends what the previous page left in
 * `sessionStorage`, the page stays inert meanwhile, and once the server has it the page
 * is rendered again from the cart that holds it.
 */
export default function CartQueueGate({
  children,
  className,
  "data-testid": testId,
}: {
  children: ReactNode
  className?: string
  "data-testid"?: string
}) {
  const { pending } = useCartState()
  const router = useRouter()
  const wasPending = useRef(false)

  useEffect(() => {
    if (pending) {
      wasPending.current = true
      return
    }
    if (wasPending.current) {
      wasPending.current = false
      router.refresh()
    }
  }, [pending, router])

  return (
    <main
      className={pending ? `${className ?? ""} pointer-events-none opacity-60` : className}
      aria-busy={pending || undefined}
      inert={pending || undefined}
      data-testid={testId}
    >
      {children}
    </main>
  )
}
