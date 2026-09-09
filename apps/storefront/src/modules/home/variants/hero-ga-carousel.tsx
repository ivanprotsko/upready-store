"use client"

import { useCallback, useLayoutEffect, useRef, useState } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"

import { Link } from "@i18n/navigation"
import { ArrowLeft, ArrowRight } from "@medusajs/icons"

import type { GallerySlide } from "./hero-gallery-data"

/**
 * Client island for hero GA. Position math re-implemented from `moveA()`
 * (`artifacts/docs/composer/lib/blocks.js:299-313`) as React state and a CSS transform
 * instead of direct DOM manipulation (`section.querySelector`), since a React component
 * cannot reach into its own rendered DOM the way the composer's plain script does.
 *
 * One deliberate change from the composer source: `moveA()` drops the neighbour peek
 * entirely at its mobile width (`blocks.css:182`, `flex: 0 0 100%`) — its own filter table
 * even states why (`blocks.js:218`, "peek × 390px — no room for neighbours"). This
 * package's own acceptance overrides that: "at 390 the neighbours are still hinted." Rather
 * than branch the slide width by breakpoint, the same 84%-of-viewport ratio applies at every
 * width (`SLIDE_RATIO` below, no `small:`-only rule), and the slide's own internal layout is
 * what changes responsively — a stacked image-over-copy panel under 1024px (readable at the
 * ~330px a slide gets at 390px viewport width) becoming the side-by-side panel from
 * `blocks.css:158` at `small:` (1024px+). A real viewport's `clientWidth` already reflects
 * this without the composer's `data-width="mobile"` fake-viewport flag.
 */

const SLIDE_RATIO = 0.84
const GAP = 14
const SWIPE_THRESHOLD = 40

export default function HeroGaCarousel({
  slides,
  brandName,
}: {
  slides: GallerySlide[]
  brandName: string | null
}) {
  const t = useTranslations("HomeHeroGallery")
  const total = slides.length
  const [index, setIndex] = useState(0)
  const [offset, setOffset] = useState(0)
  const [motionOk, setMotionOk] = useState(true)
  const viewportRef = useRef<HTMLDivElement>(null)
  const pointerStartX = useRef<number | null>(null)

  const recalc = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const viewportWidth = viewport.clientWidth
    const slideWidth = viewportWidth * SLIDE_RATIO
    const centerOffset = (viewportWidth - slideWidth) / 2
    setOffset(-(index * (slideWidth + GAP)) + centerOffset)
  }, [index])

  useLayoutEffect(() => {
    recalc()
    window.addEventListener("resize", recalc)
    return () => window.removeEventListener("resize", recalc)
  }, [recalc])

  useLayoutEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    setMotionOk(!query.matches)
    const onChange = (event: MediaQueryListEvent) => setMotionOk(!event.matches)
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])

  const goPrev = useCallback(() => setIndex((i) => (i - 1 + total) % total), [total])
  const goNext = useCallback(() => setIndex((i) => (i + 1) % total), [total])

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      goPrev()
    } else if (event.key === "ArrowRight") {
      event.preventDefault()
      goNext()
    }
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pointerStartX.current = event.clientX
  }
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerStartX.current == null) return
    const delta = event.clientX - pointerStartX.current
    pointerStartX.current = null
    if (delta > SWIPE_THRESHOLD) goPrev()
    else if (delta < -SWIPE_THRESHOLD) goNext()
  }
  const onPointerCancel = () => {
    pointerStartX.current = null
  }

  return (
    <section
      data-testid="hero-ga"
      aria-roledescription="carousel"
      aria-label={t("ga.ariaLabel")}
      className="content-container py-6 small:py-10"
      onKeyDown={onKeyDown}
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-sm text-ui-fg-subtle">
          {brandName ? (
            <span className="font-medium text-ui-fg-base">{brandName}</span>
          ) : null}
          {brandName ? " · " : null}
          {t("ga.position", { current: index + 1, total })}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="hero-ga-prev"
            onClick={goPrev}
            aria-label={t("ga.previous")}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ui-border-base text-ui-fg-base transition-colors hover:bg-ui-bg-subtle-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <ArrowLeft className="rtl:rotate-180" />
          </button>
          <button
            type="button"
            data-testid="hero-ga-next"
            onClick={goNext}
            aria-label={t("ga.next")}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ui-border-base text-ui-fg-base transition-colors hover:bg-ui-bg-subtle-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <ArrowRight className="rtl:rotate-180" />
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="overflow-hidden"
        style={{ touchAction: "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div
          className="flex"
          style={{
            gap: `${GAP}px`,
            transform: `translateX(${offset}px)`,
            transition: motionOk ? "transform 500ms cubic-bezier(0.2,0.7,0.2,1)" : "none",
            willChange: "transform",
          }}
        >
          {slides.map((slide, i) => {
            const active = i === index
            return (
              <article
                key={slide.categoryHandle}
                data-testid="hero-ga-slide"
                data-active={active}
                aria-hidden={!active}
                className="relative flex shrink-0 basis-[84%] flex-col overflow-hidden rounded-lg border border-ui-border-base bg-ui-bg-base small:h-[460px] small:flex-row"
              >
                <div className="relative h-[210px] w-full shrink-0 small:h-full small:w-[58%]">
                  {slide.image ? (
                    <Image
                      src={slide.image}
                      alt=""
                      fill
                      quality={65}
                      sizes="(max-width: 1024px) 84vw, 49vw"
                      className="object-cover object-center"
                    />
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col justify-center gap-2 p-6 small:gap-3 small:p-10">
                  {brandName ? (
                    <span className="text-xs font-medium uppercase tracking-wide text-ui-fg-subtle">
                      {brandName}
                    </span>
                  ) : null}
                  <h2 className="text-balance text-2xl font-semibold leading-tight tracking-[-0.01em] text-ui-fg-base small:text-[32px]">
                    {slide.label}
                  </h2>
                  {slide.count != null ? (
                    <p className="text-sm text-ui-fg-subtle">
                      {t("count", { count: slide.count })}
                    </p>
                  ) : null}
                  <Link
                    href={`/categories/${slide.categoryHandle}`}
                    data-testid="hero-ga-cta"
                    tabIndex={active ? 0 : -1}
                    className="mt-1 inline-flex w-fit items-center rounded-full bg-ui-button-inverted px-5 py-2.5 text-sm font-medium text-ui-contrast-fg-primary transition-colors hover:bg-ui-button-inverted-hover"
                  >
                    {t("cta", { category: slide.label })}
                  </Link>
                </div>
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 transition-opacity duration-300"
                  style={{ backgroundColor: "var(--bg-base)", opacity: active ? 0 : 0.55 }}
                />
              </article>
            )
          })}
        </div>
      </div>

      <div className="mt-4 flex justify-center gap-1.5">
        {slides.map((slide, i) => (
          <button
            key={slide.categoryHandle}
            type="button"
            data-testid="hero-ga-dot"
            aria-label={t("ga.goTo", { category: slide.label })}
            aria-current={i === index}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? "w-4 bg-ui-fg-base" : "w-1.5 bg-ui-border-base"
            }`}
          />
        ))}
      </div>
    </section>
  )
}
