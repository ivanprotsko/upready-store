import { useSyncExternalStore } from "react"

/**
 * The open state of the one search palette (`SearchPalette`, placed once by the `(main)`
 * layout), shared by every search control and by Cmd+K / Ctrl+K.
 *
 * Each `Search` used to carry a palette and a Cmd+K listener of its own, and a page draws it up
 * to three times, in the header, the phone bottom nav and the Olavka home navigation. Cmd+K then
 * opened one palette per control, stacked. A module store, the same shape as the sign-in modal's
 * (`login-modal/store.ts`), keeps one palette and lets any control open it.
 */
let open = false
const listeners = new Set<() => void>()

function set(next: boolean) {
  if (next === open) return
  open = next
  listeners.forEach((listener) => listener())
}

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getSearchOpen(): boolean {
  return open
}

export function openSearch() {
  set(true)
}

export function closeSearch() {
  set(false)
}

/** Cmd+K / Ctrl+K opens the palette, or closes it when it is already open. */
export function toggleSearch() {
  set(!open)
}

/** Answers whether a key press is the palette's shortcut, Cmd+K on a Mac and Ctrl+K elsewhere. */
export function isSearchShortcut(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey">): boolean {
  return event.key === "k" && (event.metaKey || event.ctrlKey)
}

export function useSearchOpen(): boolean {
  return useSyncExternalStore(subscribe, getSearchOpen, () => false)
}
