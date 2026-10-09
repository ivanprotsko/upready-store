"use client"

import { Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { useTranslations } from "next-intl"

import { loadProductBatch } from "@lib/data/product-batch"
import {
  createListLoader,
  parsePosition,
  positionKey,
  type ListPosition,
  type ListState,
} from "@lib/util/infinite-list"
import type { CatalogView } from "@lib/util/catalog-view"
import type { ListingInput } from "@modules/store/templates/listing-query"

/** How many loading cards stand under the list while a batch is on its way: a whole row at 2, 3 and 4 columns. */
const PLACEHOLDERS = 12

type Batch = { offset: number; count: number; items: ReactNode }

// «Back» to a list: where the browser's own history step led, and when. The list that mounts at
// that address right after it takes its saved place; a list reached by a link starts at the top.
let lastHistoryStep: { key: string; at: number } | null = null
let documentEntryRead = false

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    lastHistoryStep = { key: positionKey(location.pathname, location.search), at: Date.now() }
  })
}

const HISTORY_STEP_MS = 10_000

/** Whether this list was reached by «back» or «forward» (or a reload), so its saved place applies. */
function cameBack(key: string): boolean {
  if (lastHistoryStep && lastHistoryStep.key === key && Date.now() - lastHistoryStep.at < HISTORY_STEP_MS) {
    lastHistoryStep = null
    return true
  }
  if (documentEntryRead) return false
  documentEntryRead = true
  const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
  return entry?.type === "back_forward" || entry?.type === "reload"
}

/**
 * A product list without pages (rule 5zg, Ivan, 09.10.2026). The server renders the first screens
 * (`children`); as soon as the list is on the page, before any scroll, it asks for the next
 * batches until it holds five screens below the window, and it keeps that lead while the buyer
 * scrolls (`createListLoader`). A batch is the server's own cards (`loadProductBatch`).
 *
 * The end is said once. A batch that fails is asked for again by itself and nothing shown goes
 * away. «Back» from a product returns to the same place: the list keeps how many products it held
 * and how far the page was scrolled in `sessionStorage`, under its address.
 */
export default function InfiniteProducts({
  listing,
  shown,
  total,
  className,
  view,
  placeholder,
  children,
}: {
  listing: ListingInput
  shown: number
  total: number
  className: string
  /** The buyer's view, when the shop has the controls. */
  view?: CatalogView
  /** One card while it loads, drawn on the server. */
  placeholder: ReactNode
  children: ReactNode
}) {
  const t = useTranslations("Store")
  const [batches, setBatches] = useState<Batch[]>([])
  const [state, setState] = useState<ListState>({ loaded: shown, status: shown >= total ? "done" : "idle" })
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loaderRef = useRef<ReturnType<typeof createListLoader> | null>(null)
  const keyRef = useRef("")
  const aliveRef = useRef(false)
  const saveRef = useRef<(() => void) | null>(null)
  // The list this component was mounted for. A new sort, filter or view remounts it through its
  // key, so these never change while it lives, and the loader below is made once.
  const listRef = useRef({ listing, shown, total })

  useEffect(() => {
    const key = positionKey(location.pathname, location.search)
    keyRef.current = key
    const { listing, shown, total } = listRef.current

    const loader = createListLoader({
      shown,
      total,
      fetchBatch: async (offset, limit) => {
        const batch = await loadProductBatch(listing, offset, limit)
        if (batch.received > 0) {
          setBatches((previous) => [...previous, { offset, count: batch.received, items: batch.items }])
        }
        return { received: batch.received, total: batch.total }
      },
      measure: () => {
        const sentinel = sentinelRef.current
        return sentinel
          ? { sentinelTop: sentinel.getBoundingClientRect().top, viewportHeight: window.innerHeight }
          : null
      },
      scrollTo: (y) => window.scrollTo({ top: y, behavior: "instant" }),
      setTimer: (run, ms) => {
        const id = window.setTimeout(run, ms)
        return () => window.clearTimeout(id)
      },
      onState: setState,
    })
    loaderRef.current = loader

    let saved: ListPosition | null = null
    if (cameBack(key)) {
      try {
        saved = parsePosition(sessionStorage.getItem(key))
      } catch {
        saved = null
      }
    }

    let frame = 0
    const save = () => {
      // Only while this list is the page: a link's own scroll to the top must not overwrite it.
      if (!aliveRef.current || positionKey(location.pathname, location.search) !== keyRef.current) return
      const place = loader.position(Math.round(window.scrollY))
      if (!place) return
      try {
        sessionStorage.setItem(key, JSON.stringify(place))
      } catch {
        // A full or a forbidden storage only costs the return to the same place.
      }
    }
    saveRef.current = save
    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        loader.check()
        save()
      })
    }
    const onOnline = () => loader.retryNow()

    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll, { passive: true })
    window.addEventListener("online", onOnline)
    window.addEventListener("pagehide", save)
    // The first look ahead leaves this effect. An update made while effects run takes the
    // priority of their render, and a list hydrated inside a streamed boundary renders at
    // offscreen priority: its «loading» state then waited, idle, behind the batch's own request
    // and the loading cards never showed (stand trace, 390: busy stayed false for 4 s).
    let live = true
    queueMicrotask(() => {
      if (live) loader.start(saved)
    })

    return () => {
      live = false
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      window.removeEventListener("online", onOnline)
      window.removeEventListener("pagehide", save)
      if (frame) window.cancelAnimationFrame(frame)
      loader.stop()
      loaderRef.current = null
      saveRef.current = null
    }
  }, [])

  // Synchronous with the commit that removes the list, before any scroll a link makes.
  useLayoutEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  // A batch is on the page: finish a return to the saved place, look ahead again, and keep the
  // place with this batch in it (a batch that lands after the last scroll counts for «back» too).
  useLayoutEffect(() => {
    loaderRef.current?.rendered()
    saveRef.current?.()
  }, [batches.length])

  const loading = state.status === "loading" || state.status === "retrying"
  const done = state.status === "done"
  const placeholders = (count: number, key: string) =>
    Array.from({ length: count }, (_, index) => (
      <li key={`${key}-${index}`} className="min-w-0" aria-hidden data-testid="products-placeholder">
        {placeholder}
      </li>
    ))

  return (
    <>
      <ul
        className={className}
        data-testid="products-list"
        data-total-count={total}
        data-loaded-count={state.loaded}
        data-view={view}
        aria-busy={loading}
      >
        {children}
        {/* A batch's cards can still be on their way when the batch is: its own boundary holds
            their place with loading cards. Without it the page's boundary hid the whole list. */}
        {batches.map((batch) => (
          <Suspense key={batch.offset} fallback={placeholders(batch.count, `batch-${batch.offset}`)}>
            {batch.items}
          </Suspense>
        ))}
        {loading && placeholders(Math.min(PLACEHOLDERS, total - state.loaded), "placeholder")}
      </ul>
      <div ref={sentinelRef} aria-hidden data-testid="products-sentinel" />
      <p className="sr-only" role="status">
        {loading ? t("loadingMore") : ""}
      </p>
      {done && total > 0 ? (
        <p className="mt-10 text-center txt-compact-small text-ui-fg-muted" data-testid="products-end">
          {t("endOfList")}
        </p>
      ) : null}
    </>
  )
}
