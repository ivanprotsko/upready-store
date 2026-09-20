"use client"

import { ChevronLeft, ChevronRight, MagnifyingGlass, XMark } from "@medusajs/icons"
import Image from "next/image"
import { useTranslations } from "next-intl"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { createPortal } from "react-dom"

import { FRAME_ASPECT } from "@modules/products/components/product-media"
import ProductMediaBackdrop from "@modules/products/components/product-media/backdrop"

import GalleryDots from "./dots"
import {
  neighbourIndexes,
  swipeDirection,
  wrapIndex,
  type GalleryItem,
} from "./items"

type GalleryProps = {
  items: GalleryItem[]
  /** The product's title: the accessible name of its photos. */
  title?: string
}

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-fg-interactive"

const SWIPE_THRESHOLD = 40
const HERO_SIZES =
  "(max-width: 512px) 100vw, (max-width: 1024px) 60vw, (max-width: 1440px) 42vw, 600px"

/**
 * One photo at a time: a main frame, a thumbnail rail beside it on a desktop, dots under
 * it on a phone, arrows, swipe, and a full-screen viewer.
 *
 * The main frame is the shared product frame (`FRAME_ASPECT.gallery`, `contain`, the
 * blurred backdrop, `data-product-media`): its ratio is fixed, so neither loading nor
 * switching a photo moves anything on the page. It used to follow the natural ratio of
 * the ACTIVE photo, which shifted the whole page under the reader on every switch.
 * Nothing is drawn over the photo at rest: a marketplace photo carries its own caption
 * to the very edge, so the dots sit under the frame and the position is announced to a
 * screen reader instead of being painted on the picture. The arrows and the zoom button
 * appear on hover and on keyboard focus only.
 *
 * Behaviour ported from `chrxnasdmds/apps/storefront/src/modules/products/
 * components/image-gallery`, and from what its own suite pins down there: the
 * first image is the active one, a thumbnail click switches the hero, the
 * arrows wrap around at both ends, a dot jumps to its slide, and a
 * single-image product gets no navigation chrome at all. The look is this
 * storefront's own: `@medusajs/ui` icons, `ui-*` colour tokens, the
 * `rounded-*` radii of tailwind.config.js.
 *
 * Both rails scroll their own box only. Neither the keyboard handler nor the
 * active-thumbnail scroll ever touches window scroll, so the page stays where
 * the reader left it.
 *
 * Mounted through `./index`, which keys it by the image list so a variant swap
 * starts again at slide 1.
 */
const Gallery = ({ items, title }: GalleryProps) => {
  const t = useTranslations("ImageGallery")
  const total = items.length

  const [index, setIndex] = useState(0)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  const dragStartX = useRef<number | null>(null)
  const dragMoved = useRef(false)
  const dragCaptured = useRef(false)
  const railRef = useRef<HTMLUListElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const viewerRef = useRef<HTMLDivElement | null>(null)
  const returnFocusTo = useRef<HTMLElement | null>(null)

  const next = useCallback(
    () => setIndex((i) => wrapIndex(i, +1, total)),
    [total]
  )
  const previous = useCallback(
    () => setIndex((i) => wrapIndex(i, -1, total)),
    [total]
  )

  const openViewer = useCallback(() => {
    returnFocusTo.current = document.activeElement as HTMLElement | null
    setViewerOpen(true)
  }, [])
  const closeViewer = useCallback(() => {
    setViewerOpen(false)
    returnFocusTo.current?.focus?.()
  }, [])

  useEffect(() => setMounted(true), [])

  // Warm the neighbours so "next" paints from cache. The browser's own image
  // cache is the store, and `decoding="async"` keeps the warm-up off the main
  // thread.
  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    for (const neighbour of neighbourIndexes(index, total)) {
      const warm = new window.Image()
      warm.decoding = "async"
      warm.src = items[neighbour].url
    }
  }, [index, items, total])

  // Keep the active thumbnail inside the rail's own scroll box, in whichever
  // direction the rail runs. `scrollTo` on the rail element, never
  // `scrollIntoView`, which would drag the page along with it.
  useEffect(() => {
    const rail = railRef.current
    const thumb = rail?.children[index] as HTMLElement | undefined
    if (!rail || !thumb) {
      return
    }
    const top = thumb.offsetTop
    const bottom = top + thumb.offsetHeight
    if (top < rail.scrollTop) {
      rail.scrollTo({ top, behavior: "smooth" })
    } else if (bottom > rail.scrollTop + rail.clientHeight) {
      rail.scrollTo({ top: bottom - rail.clientHeight, behavior: "smooth" })
    }
    const left = thumb.offsetLeft
    const right = left + thumb.offsetWidth
    if (left < rail.scrollLeft) {
      rail.scrollTo({ left, behavior: "smooth" })
    } else if (right > rail.scrollLeft + rail.clientWidth) {
      rail.scrollTo({ left: right - rail.clientWidth, behavior: "smooth" })
    }
  }, [index])

  // Arrow keys move the gallery while the focus is inside it, and always while
  // the viewer is open; Escape closes the viewer. Scoping to the focus is what
  // keeps ordinary page scrolling working for a reader who never touched the
  // gallery.
  useEffect(() => {
    if (total <= 1 && !viewerOpen) {
      return
    }
    const onKey = (event: KeyboardEvent) => {
      if (viewerOpen && event.key === "Escape") {
        closeViewer()
        return
      }
      // The viewer is modal: Tab stays among its own buttons.
      if (viewerOpen && event.key === "Tab") {
        const buttons = Array.from(
          viewerRef.current?.querySelectorAll<HTMLElement>("button") ?? []
        )
        if (buttons.length) {
          const position = buttons.indexOf(document.activeElement as HTMLElement)
          const nextPosition =
            (position + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length
          event.preventDefault()
          buttons[nextPosition].focus()
        }
        return
      }
      const inGallery =
        viewerOpen ||
        (rootRef.current?.contains(document.activeElement) ?? false)
      if (!inGallery) {
        return
      }
      if (event.key === "ArrowRight") {
        event.preventDefault()
        next()
      } else if (event.key === "ArrowLeft") {
        event.preventDefault()
        previous()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [closeViewer, next, previous, total, viewerOpen])

  useEffect(() => {
    if (viewerOpen) {
      closeRef.current?.focus()
    }
  }, [viewerOpen])

  useEffect(() => {
    if (!viewerOpen) {
      return
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [viewerOpen])

  // Pointer capture starts only once the finger has actually travelled, so a
  // plain tap still reaches the hero (open the viewer) and the arrow buttons.
  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return
    }
    dragStartX.current = event.clientX
    dragMoved.current = false
    dragCaptured.current = false
  }
  const onPointerMove = (event: ReactPointerEvent) => {
    if (dragStartX.current === null) {
      return
    }
    if (Math.abs(event.clientX - dragStartX.current) <= 6) {
      return
    }
    dragMoved.current = true
    if (!dragCaptured.current) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
        dragCaptured.current = true
      } catch {
        /* capture refused: "pointer left the box" cancels the drag instead */
      }
    }
  }
  const finishPointer = (event: ReactPointerEvent, commit: boolean) => {
    if (dragStartX.current === null) {
      return
    }
    const dx = event.clientX - dragStartX.current
    dragStartX.current = null
    if (dragCaptured.current) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        /* already released */
      }
      dragCaptured.current = false
    }
    if (!commit) {
      return
    }
    const direction = swipeDirection(dx, SWIPE_THRESHOLD)
    if (direction === 1) {
      next()
    } else if (direction === -1) {
      previous()
    }
  }

  const active = items[index] ?? items[0]
  const hasChrome = total > 1
  const photoName = (position: number) =>
    title ? `${title} — ${t("counter", { index: position + 1, total })}` : t("showImage", { index: position + 1 })

  return (
    <>
      <div
        ref={rootRef}
        // Phone: a column, hero first, the rail a horizontal strip under it
        // (`flex-col-reverse`, since the rail comes first in the DOM).
        // Desktop: a two-track grid, rail then hero. A grid is what lets the
        // rail be exactly as tall as the photo — the hero's aspect box sets
        // the row height, the rail cell stretches to it, and the list inside
        // that cell is absolutely positioned so its own 38 thumbnails never
        // push the row taller (see the rail's classes below).
        className={
          hasChrome
            ? "flex flex-col-reverse items-start gap-3 small:grid small:grid-cols-[72px_minmax(0,1fr)] small:gap-3"
            : "flex flex-col items-start"
        }
        data-testid="product-gallery"
        // Set only once the effects have run, so a test has a real signal for
        // "the buttons answer now" instead of a sleep. The markup is server
        // rendered and looks finished long before it is interactive; without
        // this the first click of a suite lands on a dead gallery.
        data-hydrated={mounted ? "true" : undefined}
      >
        {hasChrome && (
          // A phone swipes and reads the dots; the rail is the desktop's.
          <div className="hidden w-full small:relative small:block small:h-full">
            <ul
              ref={railRef}
              aria-label={t("thumbnails")}
              className="flex w-full flex-row gap-2 overflow-x-auto no-scrollbar small:absolute small:inset-0 small:flex-col small:overflow-x-visible small:overflow-y-auto"
              data-testid="product-gallery-thumbnails"
            >
              {items.map((item, position) => (
                <li key={item.id} className="shrink-0 flex leading-none">
                  <button
                    type="button"
                    onClick={() => setIndex(position)}
                    aria-label={t("showImage", { index: position + 1 })}
                    aria-current={position === index ? "true" : undefined}
                    style={{ aspectRatio: FRAME_ASPECT.gallery }}
                    className={`relative m-0.5 block w-[68px] overflow-hidden rounded-rounded bg-ui-bg-subtle transition-shadow ${FOCUS_RING} ${
                      position === index
                        ? "ring-2 ring-ui-border-interactive"
                        : "ring-1 ring-ui-border-base hover:ring-ui-border-strong"
                    }`}
                    data-testid={`product-gallery-thumbnail-${position + 1}`}
                  >
                    <Image
                      src={item.url}
                      alt=""
                      fill
                      sizes="72px"
                      className="object-contain"
                    />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex w-full min-w-0 flex-col self-start">
        <div
          style={{ aspectRatio: FRAME_ASPECT.gallery }}
          // `self-start` on the wrapper: the frame keeps the height its ratio asks for
          // and so sets the grid row height. Stretching it instead would let
          // the rail decide, and the photo would grow with the number of
          // thumbnails.
          className="group relative w-full min-w-0 overflow-hidden rounded-[var(--radius,8px)] bg-ui-bg-subtle select-none touch-pan-y cursor-zoom-in"
          data-product-media="gallery"
          data-product-media-state="photo"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => finishPointer(event, true)}
          onPointerCancel={(event) => finishPointer(event, false)}
          onClick={() => {
            if (dragMoved.current) {
              return
            }
            openViewer()
          }}
          onDragStart={(event) => event.preventDefault()}
          data-testid="product-gallery-hero"
        >
          <ProductMediaBackdrop key={`backdrop-${active.id}`} src={active.url} />
          <Image
            key={active.id}
            src={active.url}
            alt={photoName(index)}
            fill
            priority
            sizes={HERO_SIZES}
            className="object-contain object-center"
            draggable={false}
            data-testid="product-gallery-hero-image"
          />
          <span aria-hidden className="pointer-events-none absolute inset-0 bg-black/[0.03] dark:bg-white/[0.04]" />

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              openViewer()
            }}
            aria-label={t("openFullImage")}
            className={`absolute end-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-circle bg-ui-bg-base text-ui-fg-base shadow-elevation-card-rest opacity-0 transition-opacity hover:bg-ui-bg-base-hover focus-visible:opacity-100 group-hover:opacity-100 ${FOCUS_RING}`}
            data-testid="product-gallery-zoom"
          >
            <MagnifyingGlass className="pointer-events-none" />
          </button>

          {hasChrome && (
            <>
              <span className="sr-only" aria-live="polite" data-testid="product-gallery-counter">
                {t("counter", { index: index + 1, total })}
              </span>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  if (dragMoved.current) {
                    return
                  }
                  previous()
                }}
                aria-label={t("previousImage")}
                className={`absolute left-3 top-1/2 -translate-y-1/2 z-10 inline-flex h-10 w-10 items-center justify-center rounded-circle bg-ui-bg-base text-ui-fg-base shadow-elevation-card-rest opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-ui-bg-base-hover transition-opacity ${FOCUS_RING}`}
                data-testid="product-gallery-previous"
              >
                <ChevronLeft className="pointer-events-none" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  if (dragMoved.current) {
                    return
                  }
                  next()
                }}
                aria-label={t("nextImage")}
                className={`absolute right-3 top-1/2 -translate-y-1/2 z-10 inline-flex h-10 w-10 items-center justify-center rounded-circle bg-ui-bg-base text-ui-fg-base shadow-elevation-card-rest opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-ui-bg-base-hover transition-opacity ${FOCUS_RING}`}
                data-testid="product-gallery-next"
              >
                <ChevronRight className="pointer-events-none" />
              </button>

            </>
          )}
        </div>
          {hasChrome && (
            <GalleryDots
              total={total}
              index={index}
              label={(position) => t("goToImage", { index: position + 1 })}
              onSelect={setIndex}
            />
          )}
        </div>
      </div>

      {mounted &&
        viewerOpen &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("openFullImage")}
            // z-[100] is this storefront's layer for a full-screen overlay
            // (the search dialog and the zoomable image both use it). At z-50
            // the sticky header stayed on top and swallowed the close button:
            // the viewer opened and could not be left by mouse.
            className="fixed inset-0 z-[100] flex items-center justify-center bg-ui-bg-overlay backdrop-blur-sm"
            onClick={closeViewer}
            ref={viewerRef}
            data-testid="product-gallery-viewer"
          >
            <button
              type="button"
              aria-label={t("close")}
              ref={closeRef}
              onClick={(event) => {
                event.stopPropagation()
                closeViewer()
              }}
              // Above the picture in paint order, or the full-bleed image
              // swallows the click and the viewer cannot be left by mouse.
              className={`absolute top-4 right-4 z-20 grid h-11 w-11 place-items-center rounded-circle bg-ui-bg-base text-ui-fg-base shadow-elevation-card-rest hover:bg-ui-bg-base-hover transition-colors ${FOCUS_RING}`}
              data-testid="product-gallery-viewer-close"
            >
              <XMark />
            </button>

            <div
              className="relative flex max-h-[90vh] max-w-[90vw] items-center justify-center"
              onClick={(event) => event.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- the
                  viewer shows the original file at whatever size the screen
                  allows, so there is no width for the optimizer to target. */}
              <img
                src={active.url}
                alt={photoName(index)}
                draggable={false}
                className="max-h-[90vh] max-w-[90vw] rounded-large object-contain"
                data-testid="product-gallery-viewer-image"
              />
            </div>

            {hasChrome && (
              <>
                <button
                  type="button"
                  aria-label={t("previousImage")}
                  onClick={(event) => {
                    event.stopPropagation()
                    previous()
                  }}
                  className={`absolute left-4 small:left-8 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-circle bg-ui-bg-base text-ui-fg-base shadow-elevation-card-rest hover:bg-ui-bg-base-hover transition-colors ${FOCUS_RING}`}
                  data-testid="product-gallery-viewer-previous"
                >
                  <ChevronLeft />
                </button>
                <button
                  type="button"
                  aria-label={t("nextImage")}
                  onClick={(event) => {
                    event.stopPropagation()
                    next()
                  }}
                  className={`absolute right-4 small:right-8 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-circle bg-ui-bg-base text-ui-fg-base shadow-elevation-card-rest hover:bg-ui-bg-base-hover transition-colors ${FOCUS_RING}`}
                  data-testid="product-gallery-viewer-next"
                >
                  <ChevronRight />
                </button>
              </>
            )}
          </div>,
          document.body
        )}
    </>
  )
}

export default Gallery
