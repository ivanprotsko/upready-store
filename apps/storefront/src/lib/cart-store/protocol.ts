import type { SyncLine } from "./queue"

/**
 * The body of `POST /api/cart`, shared by the client queue that sends it and the route
 * that checks it (`app/api/cart/route.ts`). Kept out of the server-only module so the
 * check can be tested on its own.
 */

/** More lines than any one burst of clicks produces; a body past it is refused. */
export const MAX_SYNC_LINES = 50
export const MAX_LINE_QUANTITY = 9999

/** The body of `POST /api/cart`, or null when it is not `{ lines: [{ variantId, quantity }] }`. */
export function parseSyncLines(body: unknown): SyncLine[] | null {
  const lines = (body as { lines?: unknown } | null)?.lines
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > MAX_SYNC_LINES) {
    return null
  }
  const parsed: SyncLine[] = []
  for (const line of lines) {
    const { variantId, quantity } = (line ?? {}) as Record<string, unknown>
    if (
      typeof variantId !== "string" ||
      !/^[A-Za-z0-9_]{1,64}$/.test(variantId) ||
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 0 ||
      quantity > MAX_LINE_QUANTITY
    ) {
      return null
    }
    parsed.push({ variantId, quantity })
  }
  return parsed
}
