import type { CartSnapshot, CartTransport, StoredIntent, SyncReply } from "./queue"

/** A request that has not answered in this long is treated as failed (and read back). */
const TIMEOUT_MS = 20_000

const request = async <T>(init: RequestInit): Promise<T> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch("/api/cart", {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`/api/cart answered ${response.status}`)
    }
    return (await response.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

/** The queue's way to the server: `app/api/cart/route.ts`. */
export const httpTransport: CartTransport = {
  sync: (lines, { keepalive }) =>
    request<SyncReply>({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lines }),
      keepalive,
    }),
  read: () => request<CartSnapshot>({ method: "GET" }),
}

/**
 * Intents still pending when the page goes away, kept for the next page in the same
 * tab. A full navigation (an address typed in, a reload) renders the next page before
 * the unload's `keepalive` request can land, so that page would show the cart without
 * the last clicks; it re-applies these instead and sends them again, which is safe
 * because an intent is an absolute quantity.
 */
const STORAGE_KEY = "upready:cart-queue"

/** Older than this, an entry is a leftover (a duplicated tab), not this tab's last clicks. */
const STORAGE_TTL_MS = 60_000

type Stored = { at: number; intents: StoredIntent[] }

export const storePending = (intents: StoredIntent[]): void => {
  try {
    if (intents.length === 0) {
      window.sessionStorage.removeItem(STORAGE_KEY)
      return
    }
    const entry: Stored = { at: Date.now(), intents }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entry))
  } catch {
    // Storage full or blocked: the keepalive request is still on its way.
  }
}

/** Takes the stored intents out of storage: this page owns them from now on. */
export const takePending = (): StoredIntent[] => {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    window.sessionStorage.removeItem(STORAGE_KEY)
    if (!raw) {
      return []
    }
    const entry = JSON.parse(raw) as Stored
    if (!Array.isArray(entry?.intents) || Date.now() - entry.at > STORAGE_TTL_MS) {
      return []
    }
    return entry.intents.filter(
      (intent) =>
        typeof intent?.variantId === "string" &&
        Number.isInteger(intent.quantity) &&
        intent.quantity >= 0
    )
  } catch {
    return []
  }
}
