"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { miniAppEntry } from "@lib/telegram/mini-app-entry"
import { isTelegramLaunch } from "@lib/telegram/web-app"
import Spinner from "@modules/common/icons/spinner"

/**
 * How long the checkout waits for the bridge. Past it the checkout opens with
 * the cart the webview already has; the bridge still switches the cart when it
 * finishes, and the page it finds open refreshes.
 */
const ENTRY_TIMEOUT_MS = 8000

/**
 * The body of the Mini App's checkout entry (`app/[locale]/(main)/mini/checkout`).
 * Inside Telegram it waits until `MiniAppBridge` has opened the bot's cart, then
 * replaces itself with the checkout. In a browser it goes there at once, with
 * the visitor's own cart untouched.
 */
export default function MiniCheckoutEntry({ checkoutPath }: { checkoutPath: string }) {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    const openCheckout = () => {
      if (!cancelled) router.replace(checkoutPath)
    }
    if (isTelegramLaunch()) {
      miniAppEntry.wait(ENTRY_TIMEOUT_MS).then(openCheckout)
    } else {
      openCheckout()
    }
    return () => {
      cancelled = true
    }
  }, [router, checkoutPath])

  return (
    <div className="flex min-h-[50vh] items-center justify-center" aria-busy="true">
      <Spinner size="24" />
    </div>
  )
}
