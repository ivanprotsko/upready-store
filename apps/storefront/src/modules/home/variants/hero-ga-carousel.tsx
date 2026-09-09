"use client"

import type { KeyboardEvent, PointerEvent } from "react"
import { useCallback, useLayoutEffect, useRef, useState } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"

import { Link } from "@i18n/navigation"
import { ArrowLeft, ArrowRight } from "@medusajs/icons"

import type { GallerySlide } from "./hero-gallery-data"
import styles from "./hero-ga.module.css"

type Props = {
  slides: GallerySlide[]
  brandName: string | null
}

const SLIDE_RATIO = 0.84
const GAP = 14
const SWIPE_THRESHOLD = 40

/**
 * GA · hero carousel with neighbours (composer key "ga",
 * `artifacts/docs/composer/lib/blocks.js:279` `galleryA`/`moveA`). Position math
 * re-implemented as React state plus a CSS transform instead of `moveA()`'s direct DOM
 * writes (`section.querySelector(".track").style.transform = …`) — a React component reads
 * its own rendered size through a ref instead. Every transition (track slide, dim overlay,
 * dots) lives inside `hero-ga.module.css`'s own `prefers-reduced-motion: no-preference`
 * blocks, so a reduced-motion visitor still gets the correct end state, just with no
 * animated step — no JS branch needed here for that.
 *
 * One deliberate departure from the composer source, per this package's own plan
 * acceptance ("at 390 the neighbours are still hinted"): `moveA()`'s mobile branch drops
 * the peek entirely (`blocks.css:182`, `flex: 0 0 100%`, and the family's own filter table
 * says why — `blocks.js:218`, "peek × 390px — no room for neighbours"). That branch is not
 * ported: `.slide`'s 84% flex-basis stays constant at every width
 * (`SLIDE_RATIO` below), and only the two-column layout (image beside copy) collapses to
 * stacked below 1024px (`hero-ga.module.css`'s own breakpoint) — a real viewport's
 * `clientWidth` already reflects this without the composer's `data-width="mobile"` flag.
 */
export default function HeroGalleryCarousel({ slides, brandName }: Props) {
  const t = useTranslations("Home")
  const total = slides.length
  const [index, setIndex] = useState(0)
  const [offset, setOffset] = useState(0)
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
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", recalc)
      return () => window.removeEventListener("resize", recalc)
    }
    const observer = new ResizeObserver(recalc)
    if (viewportRef.current) observer.observe(viewportRef.current)
    return () => observer.disconnect()
  }, [recalc])

  const goPrev = useCallback(
    () => setIndex((i) => (i - 1 + total) % total),
    [total]
  )
  const goNext = useCallback(() => setIndex((i) => (i + 1) % total), [total])

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      goPrev()
    } else if (event.key === "ArrowRight") {
      event.preventDefault()
      goNext()
    }
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pointerStartX.current = event.clientX
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
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
      className={styles.gallery}
      data-testid="hero-gallery-ga"
      aria-roledescription="carousel"
      aria-label={t("gallery.carouselLabel")}
      onKeyDown={onKeyDown}
    >
      <div className={styles.lead}>
        <span className={styles.count} data-testid="hero-gallery-position">
          {brandName ? <b>{brandName}</b> : null}
          {brandName ? " · " : null}
          {t("gallery.categoryCount", { count: total })} ·{" "}
          {t("gallery.slidePosition", { current: index + 1, total })}
        </span>
        <div className={styles.arrows}>
          <button
            type="button"
            className={styles.arrowButton}
            onClick={goPrev}
            aria-label={t("gallery.previous")}
            data-testid="hero-gallery-prev"
          >
            <ArrowLeft className={`${styles.arrowIcon} rtl:rotate-180`} />
          </button>
          <button
            type="button"
            className={styles.arrowButton}
            onClick={goNext}
            aria-label={t("gallery.next")}
            data-testid="hero-gallery-next"
          >
            <ArrowRight className={`${styles.arrowIcon} rtl:rotate-180`} />
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className={styles.viewport}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div
          className={styles.track}
          style={{ transform: `translateX(${offset}px)` }}
        >
          {slides.map((slide, i) => {
            const isActive = i === index
            return (
              <article
                key={slide.categoryHandle}
                className={`${styles.slide} ${isActive ? styles.on : ""}`}
                role="group"
                aria-roledescription="slide"
                aria-label={t("gallery.slidePosition", {
                  current: i + 1,
                  total,
                })}
                aria-hidden={!isActive}
                data-testid="hero-gallery-slide"
                data-active={isActive}
              >
                <div className={styles.frame}>
                  {slide.image ? (
                    <Image
                      src={slide.image}
                      alt=""
                      fill
                      priority={i === 0}
                      quality={65}
                      sizes="(max-width: 1024px) 84vw, 49vw"
                      draggable={false}
                      className={styles.image}
                    />
                  ) : null}
                </div>
                <div className={styles.pane}>
                  {brandName ? (
                    <span className={styles.eyebrow}>{brandName}</span>
                  ) : null}
                  <h2>{slide.label}</h2>
                  {slide.count != null ? (
                    <p>{t("gallery.productsCount", { count: slide.count })}</p>
                  ) : null}
                  <Link
                    href={`/categories/${slide.categoryHandle}`}
                    className={styles.cta}
                    tabIndex={isActive ? 0 : -1}
                    data-testid="hero-gallery-cta"
                  >
                    {t("gallery.shopCategory", {
                      category: slide.label.toLowerCase(),
                    })}
                  </Link>
                </div>
                <div className={styles.dim} aria-hidden />
              </article>
            )
          })}
        </div>
      </div>

      <div className={styles.dots}>
        {slides.map((slide, i) => (
          <button
            key={slide.categoryHandle}
            type="button"
            className={`${styles.dot} ${i === index ? styles.on : ""}`}
            onClick={() => setIndex(i)}
            aria-label={t("gallery.goToSlide", { category: slide.label })}
            aria-current={i === index}
            data-testid="hero-gallery-dot"
          />
        ))}
      </div>
    </section>
  )
}
