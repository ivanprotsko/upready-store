"use client"

import type { KeyboardEvent, PointerEvent } from "react"
import { useCallback, useRef, useState } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"

import { Link } from "@i18n/navigation"
import { ArrowLeft, ArrowRight } from "@medusajs/icons"

import type { OlavkaHeroSlide } from "./olavka-types"
import styles from "./olavka-hero-slider.module.css"

type Props = {
  slides: OlavkaHeroSlide[]
}

const SWIPE_THRESHOLD = 40

/**
 * The client island of the Olavka hero slider: one slide visible at a time, arrows,
 * dots, swipe and the arrow keys. Position is React state on a CSS transform
 * (`translateX(-index * 100%)`), so the track needs no measured widths — every slide is
 * exactly the viewport wide. Motion lives in the CSS module under
 * `prefers-reduced-motion: no-preference`; a reduced-motion visitor gets the same end
 * state with no animated step.
 *
 * GROUNDWORK STATE: geometry, type and the mobile layout follow the Figma node once it is
 * readable (see `nav/variants/h7.tsx`).
 */
export default function OlavkaHeroSliderCarousel({ slides }: Props) {
  const t = useTranslations("OlavkaHome.slider")
  const total = slides.length
  const [index, setIndex] = useState(0)
  const pointerStartX = useRef<number | null>(null)

  const goPrev = useCallback(() => setIndex((i) => (i - 1 + total) % total), [total])
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
      className={styles.slider}
      aria-roledescription="carousel"
      aria-label={t("label")}
      onKeyDown={onKeyDown}
      data-testid="olavka-hero-slider"
    >
      <div
        className={styles.viewport}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div className={styles.track} style={{ transform: `translateX(${-index * 100}%)` }}>
          {slides.map((slide, i) => {
            const isActive = i === index
            return (
              <article
                key={slide.id}
                className={styles.slide}
                role="group"
                aria-roledescription="slide"
                aria-label={t("position", { current: i + 1, total })}
                aria-hidden={!isActive}
                data-testid="olavka-hero-slide"
                data-active={isActive}
                data-source={slide.source}
              >
                <div className={styles.frame}>
                  {slide.image ? (
                    <Image
                      src={slide.image}
                      alt=""
                      fill
                      priority={i === 0}
                      quality={65}
                      sizes="(max-width: 1024px) 100vw, 60vw"
                      draggable={false}
                      className={styles.image}
                    />
                  ) : null}
                </div>
                <div className={styles.pane}>
                  <h2>{slide.title}</h2>
                  {slide.subtitle ? <p>{slide.subtitle}</p> : null}
                  {slide.ctaHref ? (
                    <Link
                      href={slide.ctaHref}
                      className={styles.cta}
                      tabIndex={isActive ? 0 : -1}
                      data-testid="olavka-hero-slide-cta"
                    >
                      {slide.ctaLabel ?? t("open", { title: slide.title })}
                    </Link>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.dots}>
          {slides.map((slide, i) => (
            <button
              key={slide.id}
              type="button"
              className={`${styles.dot} ${i === index ? styles.on : ""}`}
              onClick={() => setIndex(i)}
              aria-label={t("goTo", { title: slide.title })}
              aria-current={i === index}
              data-testid="olavka-hero-slider-dot"
            />
          ))}
        </div>
        <div className={styles.arrows}>
          <button
            type="button"
            className={styles.arrowButton}
            onClick={goPrev}
            aria-label={t("previous")}
            data-testid="olavka-hero-slider-prev"
          >
            <ArrowLeft className={`${styles.arrowIcon} rtl:rotate-180`} />
          </button>
          <button
            type="button"
            className={styles.arrowButton}
            onClick={goNext}
            aria-label={t("next")}
            data-testid="olavka-hero-slider-next"
          >
            <ArrowRight className={`${styles.arrowIcon} rtl:rotate-180`} />
          </button>
        </div>
      </div>
    </section>
  )
}
