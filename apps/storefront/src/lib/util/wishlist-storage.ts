/**
 * The guest wishlist: product ids kept in the browser's own localStorage, the
 * source of the heart button's state until the visitor signs in (t-cherk-32).
 * Merged into the account on sign-in (`lib/data/customer.ts` `login`/`signup`)
 * and cleared there once a logged-in render confirms the account is truth
 * (`WishlistButton`).
 *
 * Same shape as `recently-viewed.ts`: both functions take the storage as an
 * argument and never throw, because Safari in private mode and a locked-down
 * profile throw on `localStorage` access, and a product card must not.
 */
export const WISHLIST_STORAGE_KEY = "upready.wishlist"
export const WISHLIST_STORAGE_LIMIT = 200

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">

/** A Medusa entity id as sent to the store API: `<prefix>_<ULID>`, no whitespace. */
export const PRODUCT_ID = /^[a-zA-Z0-9_]{1,64}$/

export function readWishlistStorage(
  storage: StorageLike | null | undefined
): string[] {
  try {
    const raw = storage?.getItem(WISHLIST_STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    const seen = new Set<string>()
    const ids: string[] = []
    for (const value of parsed) {
      if (typeof value !== "string" || !PRODUCT_ID.test(value) || seen.has(value)) {
        continue
      }
      seen.add(value)
      ids.push(value)
      if (ids.length === WISHLIST_STORAGE_LIMIT) {
        break
      }
    }
    return ids
  } catch {
    return []
  }
}

/** Whether the write actually landed: quota or private mode must not be reported as success. */
function writeWishlistStorage(
  storage: StorageLike | null | undefined,
  ids: string[]
): boolean {
  try {
    storage?.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(ids))
    return true
  } catch {
    return false
  }
}

/** Adds `productId` and returns the list as it stands AFTER — the list BEFORE if the write silently failed, so a caller never believes an id was saved when it was not. */
export function addToWishlistStorage(
  storage: StorageLike | null | undefined,
  productId: string
): string[] {
  const current = readWishlistStorage(storage)
  if (!PRODUCT_ID.test(productId) || current.includes(productId)) {
    return current
  }
  const next = [productId, ...current].slice(0, WISHLIST_STORAGE_LIMIT)
  return writeWishlistStorage(storage, next) ? next : current
}

/** Removes `productId` and returns the list as it stands AFTER — the list BEFORE if the write silently failed. */
export function removeFromWishlistStorage(
  storage: StorageLike | null | undefined,
  productId: string
): string[] {
  const current = readWishlistStorage(storage)
  const next = current.filter((id) => id !== productId)
  return writeWishlistStorage(storage, next) ? next : current
}

export function clearWishlistStorage(storage: StorageLike | null | undefined): void {
  try {
    storage?.removeItem(WISHLIST_STORAGE_KEY)
  } catch {
    // Nothing to clear if the browser never let us read or write it.
  }
}
