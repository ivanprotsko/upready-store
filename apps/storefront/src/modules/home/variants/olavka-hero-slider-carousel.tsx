"use client"

import type { KeyboardEvent, PointerEvent, TransitionEvent } from "react"
import { useCallback, useRef, useState } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"

import { Link } from "@i18n/navigation"

import type { OlavkaHeroSlide } from "./olavka-types"
import styles from "./olavka-hero-slider.module.css"

type Props = {
  slides: OlavkaHeroSlide[]
}

const SWIPE_THRESHOLD = 40

/**
 * The client island of the Olavka hero slider (Figma 227:9298): the active banner
 * centred, a neighbour peeking on each side, arrows, dots, swipe and the arrow keys.
 *
 * The node shows a neighbour on BOTH sides of the active banner, so the track carries
 * three copies of the list and keeps the position inside the middle copy: stepping past
 * either end animates onto a clone, then — once that transition has ended — the track
 * jumps, with transitions off for that one frame, to the same slide in the middle copy.
 * Position is a CSS custom property (`--i`) on the track; the CSS module does the
 * centring maths, so nothing here measures the DOM. Motion lives under
 * `prefers-reduced-motion: no-preference` in the module.
 */
export default function OlavkaHeroSliderCarousel({ slides }: Props) {
  const t = useTranslations("OlavkaHome.slider")
  const total = slides.length
  const [pos, setPos] = useState(total)
  const [animated, setAnimated] = useState(true)
  const pointerStartX = useRef<number | null>(null)

  const index = ((pos % total) + total) % total
  const track = [...slides, ...slides, ...slides]

  const goPrev = useCallback(() => {
    setAnimated(true)
    setPos((p) => p - 1)
  }, [])
  const goNext = useCallback(() => {
    setAnimated(true)
    setPos((p) => p + 1)
  }, [])
  const goTo = useCallback(
    (i: number) => {
      setAnimated(true)
      setPos(total + i)
    },
    [total]
  )

  // Off either end of the middle copy: land silently on the same slide inside it.
  const onTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if (pos < total || pos >= total * 2) {
      setAnimated(false)
      setPos(total + index)
    }
  }

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
        <div
          className={`${styles.track} ${animated ? styles.animated : ""}`}
          style={{ "--i": pos } as React.CSSProperties}
          onTransitionEnd={onTransitionEnd}
        >
          {track.map((slide, i) => {
            const isActive = i === pos
            const isReal = i >= total && i < total * 2
            return (
              <article
                key={`${slide.id}-${i}`}
                className={`${styles.slide} ${isActive ? styles.on : ""}`}
                role="group"
                aria-roledescription="slide"
                aria-label={t("position", { current: (i % total) + 1, total })}
                aria-hidden={!isActive}
                data-testid={isReal ? "olavka-hero-slide" : undefined}
                data-active={isActive}
                data-source={slide.source}
              >
                {slide.image ? (
                  <Image
                    src={slide.image}
                    alt={slide.imageAlt}
                    fill
                    priority={isActive}
                    quality={70}
                    sizes="(max-width: 1023px) 100vw, 800px"
                    draggable={false}
                    className={styles.image}
                  />
                ) : null}
                <div className={styles.border} aria-hidden />
                <Link
                  href={slide.href}
                  className={styles.cover}
                  aria-label={slide.title}
                  tabIndex={isActive ? 0 : -1}
                />
                {slide.kicker ? (
                  <span className={`${styles.label} ${styles.kicker}`}>
                    <span className={styles.labelInner}>{slide.kicker}</span>
                  </span>
                ) : null}
                <span className={`${styles.label} ${styles.tag} ${styles.dark}`}>
                  <span className={styles.labelInner}>{t("course")}</span>
                </span>
                <span className={`${styles.label} ${styles.title} ${styles.dark}`}>
                  <h2 className={styles.labelInner}>{slide.title}</h2>
                </span>
                <Link
                  href={slide.href}
                  className={`${styles.label} ${styles.cta}`}
                  tabIndex={isActive ? 0 : -1}
                  data-testid="olavka-hero-slide-cta"
                >
                  <span className={styles.labelInner}>{t("watch")}</span>
                </Link>
              </article>
            )
          })}
        </div>

        <button
          type="button"
          className={`${styles.arrow} ${styles.arrowLeft}`}
          onClick={goPrev}
          aria-label={t("previous")}
          data-testid="olavka-hero-slider-prev"
        >
          ‹
        </button>
        <button
          type="button"
          className={`${styles.arrow} ${styles.arrowRight}`}
          onClick={goNext}
          aria-label={t("next")}
          data-testid="olavka-hero-slider-next"
        >
          ›
        </button>
      </div>

      <div className={styles.dots}>
        {slides.map((slide, i) => (
          <button
            key={slide.id}
            type="button"
            className={`${styles.dot} ${i === index ? styles.on : ""}`}
            onClick={() => goTo(i)}
            aria-label={t("goTo", { title: slide.title })}
            aria-current={i === index}
            data-testid="olavka-hero-slider-dot"
          />
        ))}
      </div>
    </section>
  )
}
