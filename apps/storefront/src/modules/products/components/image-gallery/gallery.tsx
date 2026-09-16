"use client"

import { ChevronLeft, ChevronRight, XMark } from "@medusajs/icons"
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

import GalleryDots from "./dots"
import {
  neighbourIndexes,
  parseAspect,
  swipeDirection,
  wrapIndex,
  type GalleryItem,
} from "./items"

type GalleryProps = {
  items: GalleryItem[]
  /** `metadata.aspect_ratio` of the product, e.g. "3/4". Sizes the hero box. */
  aspectRatio?: string
}

const SWIPE_THRESHOLD = 40
const HERO_SIZES =
  "(max-width: 512px) 100vw, (max-width: 1024px) 60vw, (max-width: 1440px) 42vw, 600px"

/**
 * One photo at a time, the way the chrxnasdmds product page shows them: a hero
 * box of fixed aspect so nothing on the page jumps while an image loads, a
 * thumbnail rail beside it (below it on a phone), a photo counter, arrows,
 * dots, and a full-screen viewer.
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
const Gallery = ({ items, aspectRatio }: GalleryProps) => {
  const t = useTranslations("ImageGallery")
  const total = items.length
  const aspect = parseAspect(aspectRatio)
  const aspectCss = `${aspect.w} / ${aspect.h}`

  const [index, setIndex] = useState(0)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  // Natural ratio of each image, learned from its own `onLoad`. The hero box
  // follows the ACTIVE image once measured, so a portrait photo followed by a
  // square one does not leave white bands; `aspect` from the product's
  // metadata is what the box uses until the first measurement lands.
  const [measured, setMeasured] = useState<
    Record<string, { w: number; h: number }>
  >({})

  const dragStartX = useRef<number | null>(null)
  const dragMoved = useRef(false)
  const dragCaptured = useRef(false)
  const railRef = useRef<HTMLUListElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const next = useCallback(
    () => setIndex((i) => wrapIndex(i, +1, total)),
    [total]
  )
  const previous = useCallback(
    () => setIndex((i) => wrapIndex(i, -1, total)),
    [total]
  )

  const onImageLoad = useCallback((id: string, w: number, h: number) => {
    if (!w || !h) {
      return
    }
    setMeasured((prev) => (prev[id] ? prev : { ...prev, [id]: { w, h } }))
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
        setViewerOpen(false)
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
  }, [next, previous, total, viewerOpen])

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
  const activeAspect = measured[active.id] ?? aspect
  const hasChrome = total > 1

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
        className="flex flex-col-reverse items-start gap-3 small:grid small:grid-cols-[72px_minmax(0,1fr)] small:gap-2"
        data-testid="product-gallery"
        // Set only once the effects have run, so a test has a real signal for
        // "the buttons answer now" instead of a sleep. The markup is server
        // rendered and looks finished long before it is interactive; without
        // this the first click of a suite lands on a dead gallery.
        data-hydrated={mounted ? "true" : undefined}
      >
        {hasChrome && (
          <div className="w-full small:relative small:h-full">
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
                    style={{ aspectRatio: aspectCss }}
                    className={`relative block w-[72px] overflow-hidden rounded-rounded bg-ui-bg-subtle transition-all ${
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

        <div
          style={{ aspectRatio: `${activeAspect.w} / ${activeAspect.h}` }}
          // `self-start`: the hero keeps the height its aspect ratio asks for
          // and so sets the grid row height. Stretching it instead would let
          // the rail decide, and the photo would grow with the number of
          // thumbnails.
          className="group relative w-full min-w-0 self-start overflow-hidden rounded-large bg-ui-bg-subtle select-none touch-pan-y cursor-zoom-in transition-[aspect-ratio] duration-300 ease-out"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => finishPointer(event, true)}
          onPointerCancel={(event) => finishPointer(event, false)}
          onClick={() => {
            if (dragMoved.current) {
              return
            }
            setViewerOpen(true)
          }}
          onDragStart={(event) => event.preventDefault()}
          data-testid="product-gallery-hero"
        >
          <Image
            key={active.id}
            src={active.url}
            alt={t("showImage", { index: index + 1 })}
            fill
            priority
            sizes={HERO_SIZES}
            className="object-contain"
            draggable={false}
            onLoad={(event) => {
              const img = event.currentTarget
              onImageLoad(active.id, img.naturalWidth, img.naturalHeight)
            }}
            data-testid="product-gallery-hero-image"
          />

          {hasChrome && (
            <>
              <div
                aria-label={t("counter", { index: index + 1, total })}
                className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-10 rounded-circle bg-ui-bg-base/90 px-3 py-1 txt-compact-xsmall-plus text-ui-fg-base shadow-elevation-card-rest"
                data-testid="product-gallery-counter"
              >
                <span>{index + 1}</span>
                <span aria-hidden className="mx-1.5 text-ui-fg-muted">
                  ·
                </span>
                <span aria-hidden>{total}</span>
              </div>

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
                className="absolute left-3 top-1/2 -translate-y-1/2 z-10 inline-flex h-10 w-10 items-center justify-center rounded-circle bg-ui-bg-base text-ui-fg-base shadow-elevation-card-rest opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-ui-bg-base-hover transition-opacity"
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
                className="absolute right-3 top-1/2 -translate-y-1/2 z-10 inline-flex h-10 w-10 items-center justify-center rounded-circle bg-ui-bg-base text-ui-fg-base shadow-elevation-card-rest opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-ui-bg-base-hover transition-opacity"
                data-testid="product-gallery-next"
              >
                <ChevronRight className="pointer-events-none" />
              </button>

              <GalleryDots
                total={total}
                index={index}
                label={(position) => t("goToImage", { index: position + 1 })}
                onSelect={setIndex}
              />
            </>
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
            onClick={() => setViewerOpen(false)}
            data-testid="product-gallery-viewer"
          >
            <button
              type="button"
              aria-label={t("close")}
              onClick={(event) => {
                event.stopPropagation()
                setViewerOpen(false)
              }}
              // Above the picture in paint order, or the full-bleed image
              // swallows the click and the viewer cannot be left by mouse.
              className="absolute top-4 right-4 z-20 grid h-11 w-11 place-items-center rounded-circle bg-ui-bg-base text-ui-fg-base shadow-elevation-card-rest hover:bg-ui-bg-base-hover transition-colors"
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
                alt={t("showImage", { index: index + 1 })}
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
                  className="absolute left-4 small:left-8 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-circle bg-ui-bg-base text-ui-fg-base shadow-elevation-card-rest hover:bg-ui-bg-base-hover transition-colors"
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
                  className="absolute right-4 small:right-8 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-circle bg-ui-bg-base text-ui-fg-base shadow-elevation-card-rest hover:bg-ui-bg-base-hover transition-colors"
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
