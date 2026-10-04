import { useSyncExternalStore } from "react"

/**
 * The open state of the sign-in modal (t-2026-10-04-24, Ivan 04.10: «вход нужно сделать в popup
 * без перехода на другую страницу»), shared by every «Войти» entry point and the one modal the
 * layout renders.
 *
 * A module store rather than a React context: the entry points live in the header, the bottom
 * nav, the side menu and the checkout, under two route-group layouts, and a provider would have
 * to wrap each layout's whole tree. The layout only places `LoginModalHost`; whoever renders an
 * `AccountLink` reads this store.
 *
 * `available` is true only while a `LoginModal` is mounted, which `LoginModalHost` does for a
 * guest alone. Until then (a signed-in buyer, a page with no host, or before hydration) an
 * entry point stays the plain `/account` link it always was.
 */
export type LoginModalState = {
  available: boolean
  open: boolean
  /** Open with the e-mail form already unfolded (the checkout's «По эл. почте»). */
  email: boolean
}

const CLOSED: LoginModalState = { available: false, open: false, email: false }

let state: LoginModalState = CLOSED
const listeners = new Set<() => void>()

function set(next: LoginModalState) {
  if (
    next.available === state.available &&
    next.open === state.open &&
    next.email === state.email
  ) {
    return
  }
  state = next
  listeners.forEach((listener) => listener())
}

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getLoginModalState(): LoginModalState {
  return state
}

/** Opens the modal when one is mounted; answers whether it did, so a link knows to stay put. */
export function openLoginModal(options: { email?: boolean } = {}): boolean {
  if (!state.available) return false
  set({ available: true, open: true, email: options.email ?? false })
  return true
}

export function closeLoginModal() {
  set({ ...state, open: false, email: false })
}

/** `LoginModal` calls this on mount and on unmount (a sign-in re-renders the layout without it). */
export function setLoginModalAvailable(available: boolean) {
  set(available ? { ...state, available: true } : CLOSED)
}

export function useLoginModal(): LoginModalState {
  return useSyncExternalStore(subscribe, getLoginModalState, () => CLOSED)
}
