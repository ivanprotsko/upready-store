"use client"

import { clx } from "@medusajs/ui"
import { useEffect, useState, type ReactNode } from "react"

import { pad, remaining, untilNextTick, type Remaining } from "./time"

/**
 * The moment it is: the server's `now` on the first render, so the island hydrates onto the very numbers
 * the server drew, then the browser's clock, once each time the whole seconds left to `at` change, until
 * none are left.
 */
function useNow(at: number, now: number) {
  const [moment, setMoment] = useState(now)
  useEffect(() => {
    let timer: number | undefined
    const tick = () => {
      const current = Date.now()
      setMoment(current)
      if (remaining(at, current)) timer = window.setTimeout(tick, untilNextTick(at, current))
    }
    timer = window.setTimeout(tick, 0)
    return () => window.clearTimeout(timer)
  }, [at])
  return moment
}

/**
 * The section of a countdown whose `afterEnd` is `hide`, until the end: on an open page the block goes at
 * the second the clock would read zero, as the server would no longer draw it.
 */
export function CountdownGate({ at, now, children }: { at: number; now: number; children: ReactNode }) {
  return remaining(at, useNow(at, now)) ? children : null
}

const UNITS = ["days", "hours", "minutes", "seconds"] as const

const CELL = {
  block:
    "flex flex-col items-center gap-1 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-1 py-[var(--layer-space-2,0.5rem)] small:py-[var(--layer-space-3,0.75rem)]",
  inline: "flex flex-col items-center gap-1",
} as const

/**
 * `leading-snug`, not `none`: at 1.375 the line holds the whole height of Inter, Manrope and IBM Plex Sans, so no
 * glyph stands out of its box (at 1 it stood 4–8 px out). Again after `small:text-5xl`, which brings its own 1.
 */
const NUMBER = {
  block: "text-4xl font-semibold leading-snug tabular-nums text-ui-fg-base small:text-5xl small:leading-snug",
  inline: "text-2xl font-semibold leading-snug tabular-nums text-ui-fg-base small:text-3xl",
} as const

/**
 * The ticking part of `countdown/timer`: days, hours, minutes and seconds left, each with its word under it,
 * and the line that says when the end is.
 *
 * - The numbers are a `timer` with `aria-live="off"`: a screen reader is not told every second. The words
 *   under them and the line under the clock are the visible text of the same thing, the line fixed to the
 *   end's date, time and offset.
 * - `tabular-nums`, so no number pushes its neighbours when a digit changes.
 * - At the end the clock gives way to `message`, or to nothing, exactly as the server draws an ended block.
 */
export function CountdownClock({
  at,
  now,
  size,
  units,
  deadline,
  message,
}: {
  at: number
  now: number
  size: "block" | "inline"
  units: Record<keyof Remaining, string>
  /** The deadline line around the date: `before`, the date itself in `<time>`, `after`. Null without a readable end. */
  deadline: { before: string; date: string; after: string; dateTime: string } | null
  message: string | null
}) {
  const left = remaining(at, useNow(at, now))

  if (!left) {
    return message ? (
      <p data-role="countdown" className="text-pretty text-base font-medium text-ui-fg-base small:text-lg">
        {message}
      </p>
    ) : null
  }

  return (
    <div
      className={clx(
        "flex flex-col gap-[var(--layer-space-3,0.75rem)]",
        size === "block" ? "w-full max-w-lg items-center" : "items-start small:items-center"
      )}
    >
      <div
        role="timer"
        aria-live="off"
        data-role="countdown"
        className={clx("grid grid-cols-4", size === "block" ? "w-full gap-2 xsmall:gap-3" : "gap-4 small:gap-6")}
      >
        {UNITS.map((unit) => (
          <div key={unit} className={CELL[size]}>
            <span className={NUMBER[size]}>{pad(left[unit])}</span>
            <span className="text-xs text-ui-fg-subtle">{units[unit]}</span>
          </div>
        ))}
      </div>
      {deadline ? (
        <p className="text-pretty text-base text-ui-fg-subtle small:text-sm">
          {deadline.before}
          <time dateTime={deadline.dateTime}>{deadline.date}</time>
          {deadline.after}
        </p>
      ) : null}
    </div>
  )
}
