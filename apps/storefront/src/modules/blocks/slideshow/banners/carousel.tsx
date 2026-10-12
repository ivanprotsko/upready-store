"use client"

import { clx } from "@medusajs/ui"
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react"

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"

/** The round icon buttons, the same as `testimonials/cards`' arrows. */
const ROUND = clx(
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-ui-fg-base transition-colors duration-150 hover:bg-[var(--muted)] motion-reduce:transition-none",
  focusRing
)

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)"
const subscribeMotion = (listener: () => void) => {
  const query = window.matchMedia(REDUCED_MOTION)
  query.addEventListener("change", listener)
  return () => query.removeEventListener("change", listener)
}
const subscribeNothing = () => () => {}

/** The banner `step` places from `index`, round either end. */
export const wrapIndex = (index: number, step: number, count: number) => (((index + step) % count) + count) % count

/**
 * Where a key takes the carousel from `index`: the arrows one banner on, round the ends, swapped on a
 * right-to-left page; Home and End to the first and the last. Null for any other key.
 */
export function keyTarget(key: string, index: number, count: number, rtl: boolean): number | null {
  if (key === "Home") return 0
  if (key === "End") return count - 1
  if (key === "ArrowRight") return wrapIndex(index, rtl ? -1 : 1, count)
  if (key === "ArrowLeft") return wrapIndex(index, rtl ? 1 : -1, count)
  return null
}

/**
 * Whether the banners turn by themselves now: the template asked for it, there is more than one, the
 * visitor has not asked for less motion, has not stopped it, and neither the mouse nor the focus is on it.
 */
export const rotates = (state: {
  autoplay: number | null
  count: number
  reduced: boolean
  hovered: boolean
  focused: boolean
  paused: boolean
}) =>
  state.autoplay !== null && state.count > 1 && !state.reduced && !state.hovered && !state.focused && !state.paused

/**
 * The moving part of `slideshow/banners`: the server-drawn banners side by side in one track that
 * scrolls sideways and snaps to one banner (CSS scroll-snap, no library), and the bar under it.
 *
 * - A finger or a trackpad swipes; the arrows move one banner, round the ends; a dot goes to its banner;
 *   ← → move one, Home and End go to an end, wherever the focus is inside the carousel.
 * - `autoplay` turns the banners every so many seconds, held while a mouse is over the carousel or the
 *   focus is inside it, and not at all under `prefers-reduced-motion`. The one button left of the dots
 *   stops and restarts it (WCAG 2.2.2); a phone has no hover.
 * - Once hydrated, the banners out of view are `inert`, so Tab and a screen reader stay on the one in
 *   view; a key that moves the banner under the focus moves the focus with it. The server's paint has
 *   none of this and no timer: the first banner, every link reachable.
 *
 * The carousel is the APG's: a region with `aria-roledescription="carousel"`, each banner a `group`
 * with `aria-roledescription="slide"` and its own name, the track polite while the banners stand still.
 */
export default function SlideshowCarousel({
  slides,
  names,
  autoplay,
  controls,
  labels,
}: {
  slides: ReactNode[]
  /** Each banner's name, «Баннер 2 из 4», also its dot's. */
  names: string[]
  autoplay: number | null
  controls: "both" | "dots" | "arrows"
  labels: { region: string; previous: string; next: string; pause: string; play: string }
}) {
  const track = useRef<HTMLDivElement>(null)
  const dots = useRef<(HTMLButtonElement | null)[]>([])
  /** What takes the focus once a key has moved the banners: the new banner, its dot, or nothing. */
  const follow = useRef<"slide" | "dot" | null>(null)
  const [current, setCurrent] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [paused, setPaused] = useState(false)
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false)
  const reduced = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true
  )
  const count = slides.length
  const rotating = rotates({ autoplay, count, reduced, hovered, focused, paused })

  const go = useCallback((index: number) => {
    const el = track.current
    if (!el) return
    const rtl = getComputedStyle(el).direction === "rtl"
    const still = window.matchMedia(REDUCED_MOTION).matches
    el.scrollTo({ left: (rtl ? -1 : 1) * index * el.clientWidth, behavior: still ? "instant" : "smooth" })
    setCurrent(index)
  }, [])

  // The banner in view once a swipe or a scroll has come to rest.
  useEffect(() => {
    const el = track.current
    if (!el) return
    let timer: number | undefined
    const settle = () => {
      if (!el.clientWidth) return
      const index = Math.round(Math.abs(el.scrollLeft) / el.clientWidth)
      setCurrent(Math.min(count - 1, Math.max(0, index)))
    }
    const onScroll = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(settle, 150)
    }
    const ends = "onscrollend" in window
    if (ends) el.addEventListener("scrollend", settle)
    else el.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.clearTimeout(timer)
      if (ends) el.removeEventListener("scrollend", settle)
      else el.removeEventListener("scroll", onScroll)
    }
  }, [count])

  useEffect(() => {
    if (!rotating || autoplay === null) return
    const timer = window.setTimeout(() => go(wrapIndex(current, 1, count)), autoplay * 1000)
    return () => window.clearTimeout(timer)
  }, [rotating, autoplay, current, count, go])

  // After the render that lifted `inert` off the new banner, never before: an inert element takes no focus.
  useEffect(() => {
    const to = follow.current
    follow.current = null
    if (to === "slide") (track.current?.children[current] as HTMLElement | undefined)?.focus({ preventScroll: true })
    else if (to === "dot") dots.current[current]?.focus({ preventScroll: true })
  }, [current])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl"
    const target = keyTarget(event.key, current, count, rtl)
    if (target === null) return
    event.preventDefault()
    if (target === current) return
    const from = event.target as HTMLElement
    follow.current = track.current?.contains(from) ? "slide" : from.closest("[data-dot]") ? "dot" : null
    go(target)
  }
  const onPointerEnter = (event: PointerEvent) => event.pointerType === "mouse" && setHovered(true)
  const onPointerLeave = (event: PointerEvent) => event.pointerType === "mouse" && setHovered(false)
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
  }

  const showDots = controls !== "arrows"
  const showArrows = controls !== "dots"

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={labels.region}
      onKeyDown={onKeyDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={() => setFocused(true)}
      onBlur={onBlur}
      className="flex flex-col gap-[var(--layer-space-4,1rem)]"
    >
      {/* The edge fade is as wide as the content measure's gutter: at rest it lies over the page's margin
          only, and in a swipe the next banner comes in soft rather than sliced. A focused slide's ring is
          drawn by the banner's own box (`group/slide`), inside the fade. */}
      <div
        ref={track}
        aria-live={rotating ? "off" : "polite"}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain no-scrollbar [mask-image:linear-gradient(to_right,transparent,black_1rem,black_calc(100%_-_1rem),transparent)] small:[mask-image:linear-gradient(to_right,transparent,black_1.5rem,black_calc(100%_-_1.5rem),transparent)]"
      >
        {slides.map((slide, index) => (
          <div
            key={index}
            role="group"
            aria-roledescription="slide"
            aria-label={names[index]}
            tabIndex={-1}
            inert={hydrated && index !== current}
            className="group/slide w-full shrink-0 snap-start snap-always outline-none"
          >
            {slide}
          </div>
        ))}
      </div>
      <div className="content-container flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {autoplay !== null && !reduced ? (
            <button
              type="button"
              data-role="trigger"
              aria-label={paused ? labels.play : labels.pause}
              onClick={() => setPaused((now) => !now)}
              className={ROUND}
            >
              {paused ? (
                <Play aria-hidden="true" focusable="false" strokeWidth={1.75} className="size-4" />
              ) : (
                <Pause aria-hidden="true" focusable="false" strokeWidth={1.75} className="size-4" />
              )}
            </button>
          ) : null}
          {showDots ? (
            <div className="flex">
              {names.map((name, index) => (
                <button
                  key={index}
                  ref={(el) => {
                    dots.current[index] = el
                  }}
                  type="button"
                  data-role="trigger"
                  data-dot=""
                  aria-label={name}
                  aria-current={index === current || undefined}
                  onClick={() => go(index)}
                  className={clx("inline-flex h-11 w-8 items-center justify-center rounded-full", focusRing)}
                >
                  <span
                    aria-hidden="true"
                    className={clx(
                      "block h-2 rounded-full transition-[width,background-color] duration-200 motion-reduce:transition-none",
                      index === current ? "w-6 bg-[var(--foreground)]" : "w-2 bg-[var(--muted-foreground)]"
                    )}
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {showArrows ? (
          <div className="flex gap-2">
            <button
              type="button"
              data-role="trigger"
              aria-label={labels.previous}
              onClick={() => go(wrapIndex(current, -1, count))}
              className={ROUND}
            >
              <ChevronLeft aria-hidden="true" focusable="false" strokeWidth={1.75} className="size-5 rtl:rotate-180" />
            </button>
            <button
              type="button"
              data-role="trigger"
              aria-label={labels.next}
              onClick={() => go(wrapIndex(current, 1, count))}
              className={ROUND}
            >
              <ChevronRight aria-hidden="true" focusable="false" strokeWidth={1.75} className="size-5 rtl:rotate-180" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
