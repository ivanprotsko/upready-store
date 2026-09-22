/**
 * The handles a visitor opened, newest first, in the browser's own localStorage: the
 * source of the product page's «Вы недавно просматривали» row. Nothing leaves the browser
 * and nothing is keyed to a person — a list of up to twelve handles per browser, which
 * the page turns into tiles through a server action.
 *
 * Both functions take the storage as an argument and never throw: Safari in private mode
 * and a locked-down profile throw on `localStorage` access, and a product page must not.
 * What comes out of storage is checked as if a stranger wrote it, because one can.
 */
export const RECENTLY_VIEWED_KEY = "upready.recently-viewed"
export const RECENTLY_VIEWED_LIMIT = 12

type StorageLike = Pick<Storage, "getItem" | "setItem">

/** A product handle as sent to the store API: no whitespace, no slashes or quotes, a sane length. */
export const PRODUCT_HANDLE = /^[^\s/\\"'<>]{1,200}$/

export function readRecentlyViewed(
  storage: StorageLike | null | undefined
): string[] {
  try {
    const raw = storage?.getItem(RECENTLY_VIEWED_KEY)
    if (!raw) {
      return []
    }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    const seen = new Set<string>()
    const handles: string[] = []
    for (const value of parsed) {
      if (
        typeof value !== "string" ||
        !PRODUCT_HANDLE.test(value) ||
        seen.has(value)
      ) {
        continue
      }
      seen.add(value)
      handles.push(value)
      if (handles.length === RECENTLY_VIEWED_LIMIT) {
        break
      }
    }
    return handles
  } catch {
    return []
  }
}

/**
 * Puts `handle` at the head of the list and returns the list as it stood BEFORE — the
 * products to show next to this one, without this one.
 */
export function rememberViewed(
  storage: StorageLike | null | undefined,
  handle: string
): string[] {
  const previous = readRecentlyViewed(storage).filter((item) => item !== handle)
  if (!PRODUCT_HANDLE.test(handle)) {
    return previous
  }
  try {
    storage?.setItem(
      RECENTLY_VIEWED_KEY,
      JSON.stringify([handle, ...previous].slice(0, RECENTLY_VIEWED_LIMIT))
    )
  } catch {
    // Quota or private mode: this browser simply keeps no memory, the row stays away.
  }
  return previous
}
