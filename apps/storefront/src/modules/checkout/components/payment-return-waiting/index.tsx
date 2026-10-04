"use client"

import { checkPaymentReturn } from "@lib/data/cart"
import {
  PAYMENT_RETURN_INTERVAL_MS,
  nextPaymentReturnStep,
} from "@lib/util/robokassa-return"
import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

/**
 * The Robokassa waiting page's engine (t-2026-10-04-48). It asks the backend
 * whether the payment turned the cart into an order, once at once and then
 * every few seconds for about half a minute (`nextPaymentReturnStep`), and
 * then leaves: to the confirmation page, or back to the checkout with the
 * pending notice. It renders nothing; the page around it already shows the
 * buyer where they are and the link that leaves now.
 *
 * `checkoutHref` is the locale-prefixed checkout the link points at too.
 */
export default function PaymentReturnWaiting({
  checkoutHref,
}: {
  checkoutHref: string
}) {
  const router = useRouter()
  // One loop per page. Strict Mode runs the effect twice on the same
  // instance; a second loop would complete the cart twice and could read
  // `no_cart` after the first one already removed the cookie.
  const startedRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    if (!startedRef.current) {
      startedRef.current = true
      const startedAt = Date.now()

      const look = async () => {
        const result = await checkPaymentReturn().catch(() => ({
          status: "pending" as const,
        }))

        if (!mountedRef.current) {
          return
        }

        const step = nextPaymentReturnStep(result.status, Date.now() - startedAt)

        if (step === "open_order" && result.status === "order") {
          router.replace(result.href)
        } else if (step === "back_to_checkout") {
          router.replace(checkoutHref)
        } else {
          window.setTimeout(look, PAYMENT_RETURN_INTERVAL_MS)
        }
      }

      look()
    }

    return () => {
      mountedRef.current = false
    }
  }, [checkoutHref, router])

  return null
}
