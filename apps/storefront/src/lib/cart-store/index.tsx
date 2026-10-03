"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"

import {
  CartQueue,
  type CartQueueState,
  type CartSnapshot,
} from "./queue"
import { httpTransport, storePending, takePending } from "./transport"

export type { CartSnapshot } from "./queue"

const CartQueueContext = createContext<CartQueue | null>(null)

/** What the server render and the hydration see: nothing yet, render your own props. */
const SERVER_STATE: CartQueueState = {
  seeded: false,
  server: null,
  view: null,
  pending: false,
  errors: {},
}

/**
 * The one client-side cart for every page under `[locale]/layout.tsx`
 * (t-2026-10-03-66): the header's count, the sidebar, the product page's buttons, the
 * cart page and the checkout's gate all read and change this one queue, so a click
 * anywhere shows everywhere at once. The queue itself is `./queue.ts`.
 *
 * It lives in the locale layout, above `(main)` and `(checkout)`, so a client-side
 * move between the two keeps it. Around it, the page lifecycle:
 *
 * - Hidden or unloading with something pending: the queue sends it now with
 *   `keepalive`, and the intents go into `sessionStorage` for the next page in the tab.
 * - Mounted: intents a previous page left there are applied and sent again (an
 *   absolute quantity, so a second send of one that already landed changes nothing).
 *
 * On an unload the stored intents stay stored even when the keepalive reply confirms
 * them before the old page is gone. Measured on 2026-10-03: the next page is requested
 * at the same moment as that request, its server render read the cart first, and with
 * the entry cleared it showed the quantity from before the clicks. Sending them once
 * more from the next page costs one small request and brings its view the server's
 * cart.
 */
export function CartQueueProvider({ children }: { children: ReactNode }) {
  const [queue] = useState(() => new CartQueue({ transport: httpTransport }))

  useEffect(() => {
    const restored = takePending()
    for (const intent of restored) {
      queue.set(intent.variantId, intent.quantity, intent.draft)
    }
    if (restored.length > 0) {
      queue.flush()
    }

    // Set from `beforeunload` / `pagehide` until the page is gone. A page still alive
    // a moment later did not unload (a download link, an unload the browser cancelled),
    // and goes back to clearing what it confirms.
    let leaving = false
    let stayedTimer: ReturnType<typeof setTimeout> | undefined

    const sendNow = () => {
      const intents = queue.pendingIntents()
      if (intents.length > 0) {
        storePending(intents)
      }
      queue.flush({ keepalive: true })
    }
    const leave = () => {
      leaving = true
      clearTimeout(stayedTimer)
      stayedTimer = setTimeout(() => {
        leaving = false
        sync()
      }, 3000)
      sendNow()
    }
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        sendNow()
      }
    }
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        leaving = false
        sync()
      }
    }

    // `beforeunload` fires before the next page is even requested, `pagehide` only
    // once it has arrived, so the first gives the request a head start. It is
    // listened to only while something is pending: some browsers keep a page with a
    // `beforeunload` listener out of the back/forward cache.
    let listening = false
    const sync = () => {
      const { pending } = queue.getState()
      if (pending && !listening) {
        window.addEventListener("beforeunload", leave)
        listening = true
      } else if (!pending && listening) {
        window.removeEventListener("beforeunload", leave)
        listening = false
      }
      // Confirmed: whatever was stored is history now, unless this page is going away
      // and the next one still has to see it.
      if (!pending && !leaving) {
        storePending([])
      }
    }
    const unsubscribe = queue.subscribe(sync)
    sync()

    window.addEventListener("pagehide", leave)
    window.addEventListener("pageshow", onPageShow)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      unsubscribe()
      clearTimeout(stayedTimer)
      window.removeEventListener("beforeunload", leave)
      window.removeEventListener("pagehide", leave)
      window.removeEventListener("pageshow", onPageShow)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [queue])

  return <CartQueueContext.Provider value={queue}>{children}</CartQueueContext.Provider>
}

export function useCartQueue(): CartQueue {
  const queue = useContext(CartQueueContext)
  if (!queue) {
    throw new Error("useCartQueue needs a CartQueueProvider above it")
  }
  return queue
}

export function useCartState(): CartQueueState {
  const queue = useCartQueue()
  return useSyncExternalStore(queue.subscribe, queue.getState, () => SERVER_STATE)
}

/**
 * The cart to draw, and the queue to change it with.
 *
 * `snapshot` is the cart this component's server render read
 * (`retrieveCartSnapshot`). It is what the component shows on the server and in
 * hydration, before the queue has a cart, and it is handed to the queue, which keeps
 * it only if it is newer than what it has (`CartQueue.seed`). From then on the queue's
 * view wins: the server's last cart with the pending clicks laid over it.
 */
export function useCart(snapshot?: CartSnapshot | null) {
  const queue = useCartQueue()
  const state = useCartState()

  useEffect(() => {
    if (snapshot) {
      queue.seed(snapshot)
    }
  }, [queue, snapshot])

  return {
    cart: state.seeded ? state.view : (snapshot?.cart ?? null),
    pending: state.pending,
    errors: state.errors,
    queue,
  }
}
