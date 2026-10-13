"use client"

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react"
import { clx } from "@medusajs/ui"
import { Pause, Play, X } from "lucide-react"
import Image from "next/image"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type KeyboardEvent,
  type PointerEvent,
  type SetStateAction,
} from "react"

import { Link } from "@i18n/navigation"

import { SEEN_KEY, SLIDE_MS, addSeen, advances, keyDirection, nameSlide, readSeen, step, type Position } from "./stories"

export type ViewerImage = { url: string; alt: string }

export type ViewerSlide = { image: ViewerImage; text: string | null; button: { href: string; label: string } | null }

export type ViewerStory = {
  /** What `sessionStorage` remembers the story by once it was opened. */
  key: string
  title: string
  cover: ViewerImage
  slides: ViewerSlide[]
}

export type ViewerLabels = {
  region: string
  slide: string
  previous: string
  next: string
  close: string
  pause: string
  play: string
}

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"

/** The round icon buttons of the dialog's bar, the same as `slideshow/banners`' arrows. */
const ROUND = clx(
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] transition-colors duration-150 hover:bg-[var(--muted)] motion-reduce:transition-none",
  focusRing
)

/** The template's button layer (`--layer-button-*`), the theme's primary pair without a template. */
const BUTTON =
  "inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius)] border border-[var(--layer-button-border,var(--primary))] bg-[var(--layer-button-bg,var(--primary))] px-6 text-base font-medium text-[var(--layer-button-fg,var(--primary-foreground))] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] motion-safe:transition-colors"

/** A press held this long pauses the slide and does not turn it when it lets go. */
const HOLD_MS = 300

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)"
const subscribeMotion = (listener: () => void) => {
  const query = window.matchMedia(REDUCED_MOTION)
  query.addEventListener("change", listener)
  return () => query.removeEventListener("change", listener)
}

/** The seen stories live in `sessionStorage`; this tab hears its own writes through an event of its own. */
const SEEN_EVENT = "upready-stories-seen"
const readStorage = () => {
  try {
    return window.sessionStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}
const subscribeSeen = (listener: () => void) => {
  window.addEventListener(SEEN_EVENT, listener)
  window.addEventListener("storage", listener)
  return () => {
    window.removeEventListener(SEEN_EVENT, listener)
    window.removeEventListener("storage", listener)
  }
}
const markSeen = (key: string) => {
  try {
    window.sessionStorage.setItem(SEEN_KEY, addSeen(readStorage(), key))
  } catch {
    return
  }
  window.dispatchEvent(new Event(SEEN_EVENT))
}

/**
 * The moving part of `media/stories`: the row of circles and the dialog one of them opens.
 *
 * - The row scrolls sideways in the content container. A circle's ring is the theme's `--primary` until the
 *   story was opened in this tab, then `--border` (`sessionStorage`). The server's paint has every ring unseen.
 * - The dialog is the storefront's own (`@headlessui/react`, as the search palette and the zoomed picture): it
 *   traps the focus, closes on Esc and on its button, and gives the focus back to the circle.
 * - A slide stays `SLIDE_MS`, its bar filling meanwhile, then the next one comes, then the next story; after the
 *   last the dialog closes. A mouse over the dialog, a finger held on the picture or the pause button hold it.
 *   Under `prefers-reduced-motion` nothing moves by itself: the bar of the slide in view stands full.
 * - The first third of the picture goes back and the rest on, as a tap or a click; ← → do the same.
 */
export default function StoriesViewer({ stories, labels }: { stories: ViewerStory[]; labels: ViewerLabels }) {
  const [at, setAt] = useState<Position | null>(null)
  const seenRaw = useSyncExternalStore(subscribeSeen, readStorage, () => null)
  const seen = useMemo(() => new Set(readSeen(seenRaw)), [seenRaw])
  const openStory = at?.story ?? null

  useEffect(() => {
    if (openStory !== null) markSeen(stories[openStory].key)
  }, [openStory, stories])

  return (
    <>
      {/* The row runs into the content container's gutters (`globals.css`: `px-4 lg:px-6`) and fades out over
          them, as `slideshow/banners`' track does: at rest the first circle stands on the page's left edge, and a
          circle half out of view comes in soft rather than sliced. `py-1` is the room of a focused ring. */}
      <ul
        aria-label={labels.region}
        className="-mx-4 flex gap-[var(--layer-space-4,1rem)] overflow-x-auto overscroll-x-contain px-4 py-1 no-scrollbar [mask-image:linear-gradient(to_right,transparent,black_1rem,black_calc(100%_-_1rem),transparent)] small:-mx-6 small:px-6 small:[mask-image:linear-gradient(to_right,transparent,black_1.5rem,black_calc(100%_-_1.5rem),transparent)]"
      >
        {stories.map((story, index) => (
          <li key={index} className="w-20 shrink-0 small:w-24">
            <button
              type="button"
              data-role="story-circle"
              aria-haspopup="dialog"
              onClick={() => setAt({ story: index, slide: 0 })}
              className="group flex w-full flex-col items-center gap-2 text-center focus-visible:outline-none"
            >
              <span
                className={clx(
                  "block rounded-full border-2 p-1 transition-colors duration-150 motion-reduce:transition-none group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-[var(--ring)]",
                  seen.has(story.key) ? "border-[var(--border)]" : "border-[var(--primary)]"
                )}
              >
                <span data-role="card-image" className="relative block size-16 overflow-hidden rounded-full bg-[var(--muted)] small:size-20">
                  <Image src={story.cover.url} alt="" fill sizes="80px" className="object-cover" />
                </span>
              </span>
              <span className="break-words text-sm text-ui-fg-base">{story.title}</span>
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={at !== null} onClose={() => setAt(null)} className="relative z-[100]">
        <DialogBackdrop className="fixed inset-0 bg-ui-bg-overlay" />
        <div className="fixed inset-0 flex items-center justify-center xsmall:p-[var(--layer-space-6,1.5rem)]">
          {at ? <Viewer stories={stories} at={at} setAt={setAt} labels={labels} /> : null}
        </div>
      </Dialog>
    </>
  )
}

/** The open story: its bars and its bar of buttons, the slide's picture, and the slide's words under it. */
function Viewer({
  stories,
  at,
  setAt,
  labels,
}: {
  stories: ViewerStory[]
  at: Position
  setAt: Dispatch<SetStateAction<Position | null>>
  labels: ViewerLabels
}) {
  const fills = useRef<(HTMLSpanElement | null)[]>([])
  const animation = useRef<Animation | null>(null)
  const pressedAt = useRef(0)
  const [paused, setPaused] = useState(false)
  const [pressed, setPressed] = useState(false)
  const [hovered, setHovered] = useState(false)
  const reduced = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true
  )
  const counts = useMemo(() => stories.map((story) => story.slides.length), [stories])
  const story = stories[at.story]
  const slide = story.slides[at.slide]
  const running = advances({ reduced, paused, pressed, hovered })

  const go = useCallback((direction: 1 | -1) => setAt((now) => (now ? step(now, direction, counts) : null)), [setAt, counts])

  // The bar of the slide in view fills over `SLIDE_MS`, and the slide turns when it is full.
  useEffect(() => {
    const fill = fills.current[at.slide]
    if (reduced || !fill || typeof fill.animate !== "function") return
    const run = fill.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: SLIDE_MS, fill: "forwards" })
    run.onfinish = () => go(1)
    animation.current = run
    return () => {
      run.onfinish = null
      run.cancel()
      animation.current = null
    }
  }, [at.story, at.slide, reduced, go])

  useEffect(() => {
    const run = animation.current
    if (!run) return
    if (running) run.play()
    else run.pause()
  }, [running, at.story, at.slide])

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const direction = keyDirection(event.key, getComputedStyle(event.currentTarget).direction === "rtl")
    if (direction === null) return
    event.preventDefault()
    go(direction)
  }
  const onPointerEnter = (event: PointerEvent) => event.pointerType === "mouse" && setHovered(true)
  const onPointerLeave = (event: PointerEvent) => event.pointerType === "mouse" && setHovered(false)
  const press = () => {
    pressedAt.current = Date.now()
    setPressed(true)
  }
  const release = () => setPressed(false)
  /** A tap turns the slide; a press held to pause it does not. */
  const tap = (direction: 1 | -1) => {
    const held = pressedAt.current !== 0 && Date.now() - pressedAt.current > HOLD_MS
    pressedAt.current = 0
    if (!held) go(direction)
  }
  const fillOf = (index: number) => (index < at.slide || (index === at.slide && reduced) ? 1 : 0)
  const zone = clx("absolute inset-y-0 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[var(--ring)]")

  return (
    <DialogPanel
      data-role="dialog"
      onKeyDown={onKeyDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className="flex h-full w-full flex-col overflow-hidden bg-[var(--card)] text-[var(--card-foreground)] xsmall:h-[min(90dvh,48rem)] xsmall:w-auto xsmall:aspect-[9/16] xsmall:rounded-[var(--radius)]"
    >
      <div className="flex flex-col gap-[var(--layer-space-3,0.75rem)] p-[var(--layer-space-4,1rem)]">
        <div aria-hidden="true" className="flex gap-1">
          {story.slides.map((_, index) => (
            <span key={`${at.story}-${index}`} className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--muted)]">
              <span
                ref={(el) => {
                  fills.current[index] = el
                }}
                className="block h-full w-full origin-left bg-[var(--foreground)] rtl:origin-right"
                style={{ transform: `scaleX(${fillOf(index)})` }}
              />
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <DialogTitle className="min-w-0 flex-1 break-words text-base font-medium">{story.title}</DialogTitle>
          <p className="sr-only" aria-live={running ? "off" : "polite"}>
            {nameSlide(labels.slide, at.slide, story.slides.length)}
          </p>
          {reduced ? null : (
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
          )}
          <button type="button" data-role="close-button" aria-label={labels.close} onClick={() => setAt(null)} className={ROUND}>
            <X aria-hidden="true" focusable="false" strokeWidth={1.75} className="size-5" />
          </button>
        </div>
      </div>
      <div
        data-role="card-image"
        className="relative min-h-0 flex-1 bg-[var(--muted)]"
        onPointerDown={press}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={release}
      >
        <Image key={slide.image.url} src={slide.image.url} alt={slide.image.alt} fill sizes="(min-width: 512px) 27rem, 100vw" className="object-cover" />
        <button type="button" data-role="trigger" aria-label={labels.previous} onClick={() => tap(-1)} className={clx(zone, "start-0 w-1/3")} />
        <button type="button" data-role="trigger" aria-label={labels.next} onClick={() => tap(1)} className={clx(zone, "end-0 w-2/3")} />
      </div>
      {slide.text || slide.button ? (
        <div className="flex flex-col items-start gap-[var(--layer-space-3,0.75rem)] p-[var(--layer-space-4,1rem)]">
          {slide.text ? <p className="text-base">{slide.text}</p> : null}
          {slide.button ? (
            slide.button.href.startsWith("/") ? (
              <Link data-role="cta-primary" href={slide.button.href} onClick={() => setAt(null)} className={BUTTON}>
                {slide.button.label}
              </Link>
            ) : (
              <a data-role="cta-primary" href={slide.button.href} className={BUTTON}>
                {slide.button.label}
              </a>
            )
          ) : null}
        </div>
      ) : null}
    </DialogPanel>
  )
}
