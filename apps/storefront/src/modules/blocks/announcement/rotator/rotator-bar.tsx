"use client"

import { clx } from "@medusajs/ui"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type PointerEvent,
} from "react"

import { Link } from "@i18n/navigation"

/** One announcement in the visitor's language. */
export type RotatorLine = { text: string; href: string | null }

export type RotatorBarProps = {
  lines: RotatorLine[]
  interval: number
  dismissible: boolean
  storageKey: string
  labels: { region: string; previous: string; next: string; close: string }
}

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--primary-foreground)]"

const BUTTON_CLASS = clx(
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius)] hover:opacity-80",
  focusRing
)

const LINK_CLASS = clx(
  "rounded-[var(--radius)] underline decoration-1 underline-offset-4 hover:decoration-2",
  focusRing
)

/* The dismissal lives in sessionStorage, which has no change event inside the tab: the bar
   tells its own subscribers when it writes. Unreadable storage (private mode) reads as open. */
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const readDismissed = (key: string) => {
  try {
    return window.sessionStorage.getItem(key) === "1"
  } catch {
    return false
  }
}
const writeDismissed = (key: string) => {
  try {
    window.sessionStorage.setItem(key, "1")
  } catch {
    // Not kept: the bar closes for this page only.
  }
  listeners.forEach((listener) => listener())
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)"
const subscribeMotion = (listener: () => void) => {
  const query = window.matchMedia(REDUCED_MOTION)
  query.addEventListener("change", listener)
  return () => query.removeEventListener("change", listener)
}

/**
 * The moving part of `announcement/rotator`: the lines in turn every `interval` seconds, held
 * while a mouse is over the bar or the focus is inside it, and not at all under
 * `prefers-reduced-motion`, where the first line stays until the visitor turns it with an arrow.
 * The server renders the first line and no timer; the rotation starts after hydration.
 *
 * The arrows flank the line inside a 42rem group in the bar's centre, as in the Shopify catalogue's
 * Dawn, rather than at the screen's edges; the close button keeps the right edge.
 *
 * Every line stands in the same grid cell, the hidden ones `invisible`, so the bar is as tall as
 * its longest line and does not jump when the line changes; a hidden line's link is out of the
 * tab order.
 */
export default function RotatorBar({
  lines,
  interval,
  dismissible,
  storageKey,
  labels,
}: RotatorBarProps) {
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const reduced = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true
  )
  const dismissed = useSyncExternalStore(
    subscribe,
    () => dismissible && readDismissed(storageKey),
    () => false
  )
  const many = lines.length > 1
  const rotating = many && !reduced && !hovered && !focused

  useEffect(() => {
    if (!rotating) return
    const timer = window.setTimeout(
      () => setIndex((current) => (current + 1) % lines.length),
      interval * 1000
    )
    return () => window.clearTimeout(timer)
  }, [rotating, index, interval, lines.length])

  if (dismissed) {
    return null
  }

  const turn = (step: number) =>
    setIndex((current) => (current + step + lines.length) % lines.length)
  const onPointerEnter = (event: PointerEvent) =>
    event.pointerType === "mouse" && setHovered(true)
  const onPointerLeave = (event: PointerEvent) =>
    event.pointerType === "mouse" && setHovered(false)
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
  }

  return (
    <section
      data-block="announcement/rotator"
      aria-label={labels.region}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={() => setFocused(true)}
      onBlur={onBlur}
      className="flex min-h-11 w-full items-center bg-[var(--primary)] text-sm text-[var(--primary-foreground)]"
    >
      {/* Balances the close button from 512px, so the line stays in the page's centre. */}
      {dismissible ? (
        <span aria-hidden className="hidden w-11 shrink-0 xsmall:block" />
      ) : null}
      <div className="flex min-w-0 flex-1 justify-center">
        <div className="flex w-full max-w-2xl items-center">
          {many ? (
            <button
              type="button"
              data-role="trigger"
              aria-label={labels.previous}
              onClick={() => turn(-1)}
              className={BUTTON_CLASS}
            >
              <ChevronLeft aria-hidden className="h-4 w-4" />
            </button>
          ) : null}
          <div
            aria-live={rotating ? "off" : "polite"}
            className={clx(
              "grid flex-1 justify-items-center py-[calc(0.5rem*var(--layer-density,1))] text-center",
              many || dismissible ? "px-2" : "px-4"
            )}
          >
            {lines.map((line, position) => {
              const active = position === index
              return (
                <p
                  key={position}
                  data-role="description"
                  aria-hidden={!active}
                  className={clx(
                    "col-start-1 row-start-1 max-w-xl self-center text-balance transition-[opacity,visibility] duration-200 motion-reduce:transition-none",
                    active ? "visible opacity-100" : "invisible opacity-0"
                  )}
                >
                  {line.href ? (
                    line.href.startsWith("/") ? (
                      <Link
                        href={line.href}
                        data-role="nav-link"
                        className={LINK_CLASS}
                      >
                        {line.text}
                      </Link>
                    ) : (
                      <a
                        href={line.href}
                        data-role="nav-link"
                        className={LINK_CLASS}
                      >
                        {line.text}
                      </a>
                    )
                  ) : (
                    line.text
                  )}
                </p>
              )
            })}
          </div>
          {many ? (
            <button
              type="button"
              data-role="trigger"
              aria-label={labels.next}
              onClick={() => turn(1)}
              className={BUTTON_CLASS}
            >
              <ChevronRight aria-hidden className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
      {dismissible ? (
        <button
          type="button"
          data-role="close-button"
          aria-label={labels.close}
          onClick={() => writeDismissed(storageKey)}
          className={BUTTON_CLASS}
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      ) : null}
    </section>
  )
}
