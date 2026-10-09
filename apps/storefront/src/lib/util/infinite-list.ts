/**
 * A product list never has pagination (rule 5zg, Ivan, 09.10.2026, about cherkashino.ru/ru/store:
 * «убираем пагинацию и больше никогда не делаем, вместо этого делаем lazy-loading, при этом
 * товары должны загрузиться еще до того как пользователь начал скроллить, чтобы когда он начнет
 * крутить, то начали грузиться товары уже с четвертого и пятого экранов»).
 *
 * The server renders the first screens (`FIRST_SCREENS_PRODUCTS`). Right after the page comes
 * alive, before any scroll, the list asks for the next batches until the products it holds reach
 * `AHEAD_SCREENS` screens below the bottom of the window, and it keeps that distance while the
 * buyer scrolls (`InfiniteProducts`). These are the numbers and the decisions it takes, kept
 * apart from React so a test can hold them.
 */

/**
 * The products the server renders. Two columns on a phone and three or four on a desktop put
 * four to six screens of cards in 24 (measured on the stand, 390×844 and 1440×900).
 */
export const FIRST_SCREENS_PRODUCTS = 24

/** The products one background request brings. */
export const BATCH_PRODUCTS = 24

/** How many screens of products the list holds below the bottom of the window. */
export const AHEAD_SCREENS = 5

/** The most products one request may ask for: the one request that rebuilds a list after «back». */
export const MAX_REQUEST_PRODUCTS = 240

/** The waits before a failed batch is asked for again; the last one repeats. */
export const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000] as const

export const retryDelay = (attempt: number): number =>
  RETRY_DELAYS_MS[Math.min(Math.max(attempt, 0), RETRY_DELAYS_MS.length - 1)]

/**
 * Whether the list should ask for more: the end of what it holds (`sentinelTop`, from the top of
 * the window) stands less than `aheadScreens` screens below the bottom of the window.
 */
export const needsMore = ({
  sentinelTop,
  viewportHeight,
  aheadScreens = AHEAD_SCREENS,
}: {
  sentinelTop: number
  viewportHeight: number
  aheadScreens?: number
}): boolean => viewportHeight > 0 && sentinelTop - viewportHeight < aheadScreens * viewportHeight

/** An offset and a size a request may carry: whole, not negative, and at most `MAX_REQUEST_PRODUCTS`. */
export const clampRequest = (offset: unknown, limit: unknown): { offset: number; limit: number } => {
  const whole = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback

  return {
    offset: Math.max(0, whole(offset, 0)),
    limit: Math.min(MAX_REQUEST_PRODUCTS, Math.max(1, whole(limit, BATCH_PRODUCTS))),
  }
}

/**
 * Where the buyer left a list: how many products it held and how far the page was scrolled. It
 * lives in `sessionStorage` under the list's address, so «back» from a product page finds the
 * same place without a page number in the address.
 */
export type ListPosition = { count: number; y: number }

export const positionKey = (pathname: string, search: string): string =>
  `products-list:${pathname}${search}`

export const parsePosition = (raw: string | null): ListPosition | null => {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<ListPosition>
    if (
      typeof value.count !== "number" ||
      typeof value.y !== "number" ||
      !Number.isFinite(value.count) ||
      !Number.isFinite(value.y) ||
      value.count < 0 ||
      value.y < 0
    ) {
      return null
    }
    return { count: Math.floor(value.count), y: Math.floor(value.y) }
  } catch {
    return null
  }
}

/**
 * How many products the one request after «back» brings: the ones the buyer had beyond what the
 * server rendered, within what the list has and within `MAX_REQUEST_PRODUCTS`. Zero when the
 * server's first screens already hold the place.
 */
export const restoreLimit = (saved: ListPosition | null, shown: number, total: number): number => {
  if (!saved) return 0
  const wanted = Math.min(saved.count, total) - shown
  return wanted > 0 ? Math.min(wanted, MAX_REQUEST_PRODUCTS) : 0
}

export type ListStatus = "idle" | "loading" | "retrying" | "done"

export type ListState = { loaded: number; status: ListStatus }

export type ListLoaderDeps = {
  /** The products the server rendered and how many the list has in all. */
  shown: number
  total: number
  /** Asks for `limit` products from `offset` and hands them to the page; resolves with how many came. */
  fetchBatch: (offset: number, limit: number) => Promise<{ received: number; total: number }>
  /** Where the end of the list stands, or `null` while it is not on the page. */
  measure: () => { sentinelTop: number; viewportHeight: number } | null
  scrollTo: (y: number) => void
  setTimer: (run: () => void, ms: number) => () => void
  onState: (state: ListState) => void
}

/**
 * The list's decisions, with the page behind four callbacks (`ListLoaderDeps`), so a test drives
 * it with a fake page. `InfiniteProducts` calls `start` once the list is on the page, `check` on
 * every scroll and resize, and `rendered` after each batch is drawn.
 *
 * One request at a time. A batch that fails is asked for again after `retryDelay` and nothing
 * shown goes away; the list is `done` once a batch comes back empty or the total is reached.
 */
export function createListLoader(deps: ListLoaderDeps) {
  let loaded = deps.shown
  let status: ListStatus = deps.shown >= deps.total ? "done" : "idle"
  let busy = false
  let attempt = 0
  let stopped = false
  let cancelRetry: (() => void) | null = null
  let pendingScroll: number | null = null
  let pendingLimit = BATCH_PRODUCTS

  const set = (next: ListStatus) => {
    status = next
    deps.onState({ loaded, status })
  }

  const load = async (limit: number = BATCH_PRODUCTS): Promise<void> => {
    if (stopped || busy || status === "done") return
    busy = true
    pendingLimit = limit
    set("loading")
    const offset = loaded
    try {
      const batch = await deps.fetchBatch(offset, limit)
      if (stopped) return
      attempt = 0
      loaded = offset + batch.received
      busy = false
      set(batch.received === 0 || loaded >= Math.min(deps.total, batch.total) ? "done" : "idle")
    } catch {
      if (stopped) return
      set("retrying")
      cancelRetry = deps.setTimer(() => {
        cancelRetry = null
        busy = false
        void load(pendingLimit)
      }, retryDelay(attempt++))
    }
  }

  const check = () => {
    if (stopped || busy || status === "done" || pendingScroll !== null) return
    const at = deps.measure()
    if (at && needsMore(at)) void load()
  }

  return {
    /**
     * The list is on the page. With a saved place (the buyer came back to this list), the
     * products it held come in one request and the page scrolls to where it was; otherwise the
     * list fills the screens ahead at once, before any scroll.
     */
    start(saved: ListPosition | null = null) {
      const limit = restoreLimit(saved, deps.shown, deps.total)
      if (saved && limit > 0) {
        pendingScroll = saved.y
        void load(limit)
        return
      }
      if (saved) deps.scrollTo(saved.y)
      check()
    },
    check,
    /** A batch has been drawn: finish a pending return to the saved place, then look ahead again. */
    rendered() {
      if (pendingScroll !== null && !busy) {
        const y = pendingScroll
        pendingScroll = null
        deps.scrollTo(y)
      }
      check()
    },
    /** The network is back: a waiting retry goes now. */
    retryNow() {
      if (status !== "retrying" || !cancelRetry) return
      cancelRetry()
      cancelRetry = null
      busy = false
      void load(pendingLimit)
    },
    stop() {
      stopped = true
      cancelRetry?.()
      cancelRetry = null
    },
    state: (): ListState => ({ loaded, status }),
    /**
     * The place to keep for «back» with the page at `y`: every product the list holds, a batch
     * that came after the last scroll included. None while a return to a saved place is still
     * on its way, so a half-restored list does not overwrite the place it is returning to.
     */
    position: (y: number): ListPosition | null => (pendingScroll !== null ? null : { count: loaded, y }),
  }
}
