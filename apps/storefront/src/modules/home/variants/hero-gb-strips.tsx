"use client"

import type { KeyboardEvent } from "react"
import { useCallback, useState } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"

import { Link } from "@i18n/navigation"

import type { GallerySlide } from "./hero-gallery-data"
import styles from "./hero-gb.module.css"

type Props = {
  slides: GallerySlide[]
  brandName: string | null
}

/**
 * GB · hero stripes (composer key "gb", `artifacts/docs/composer/lib/blocks.js:290`
 * `galleryB`). Simpler state than GA — one active index, no position math — but the composer
 * click handler only toggles a NOT-yet-active strip (`blocks.js:319-322`), so here each
 * collapsed strip is its own `<button>` (the vertical label chip) and the expanded pane, with
 * its real `<Link>` CTA, renders only for the active strip: a button can never end up
 * containing that link (invalid — two nested interactive elements), and an already-active
 * strip needs no click target of its own.
 *
 * ArrowLeft/ArrowRight (and Up/Down, since the strip row itself becomes a column below
 * 1024px, `hero-gb.module.css`'s own breakpoint) move the active strip by one from anywhere
 * inside the section, the same bubbling-keydown approach as `hero-ga-carousel.tsx`.
 */
export default function HeroGalleryStrips({ slides, brandName }: Props) {
  const t = useTranslations("Home")
  const [active, setActive] = useState(0)
  const count = slides.length

  const move = useCallback(
    (delta: number) => {
      setActive((current) => (current + delta + count) % count)
    },
    [count]
  )

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault()
      move(-1)
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault()
      move(1)
    }
  }

  return (
    <section
      className={styles.gallery}
      data-testid="hero-gallery-gb"
      aria-roledescription="carousel"
      aria-label={t("gallery.carouselLabel")}
      onKeyDown={onKeyDown}
    >
      <div className={styles.lead}>
        <span className={styles.count}>
          {brandName ? <b>{brandName}</b> : null}
          {brandName ? " · " : null}
          {t("gallery.categoryCount", { count })} · {t("gallery.clickHint")}
        </span>
      </div>

      <div className={styles.strips}>
        {slides.map((slide, i) => {
          const isActive = i === active

          return (
            <article
              key={slide.categoryHandle}
              className={`${styles.strip} ${isActive ? styles.on : ""}`}
              role="group"
              aria-roledescription="slide"
              aria-label={t("gallery.slidePosition", {
                current: i + 1,
                total: count,
              })}
              data-testid="hero-gallery-strip"
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
                    sizes="(max-width: 1024px) 100vw, 20vw"
                    draggable={false}
                    className={styles.image}
                  />
                ) : null}
              </div>

              {isActive ? (
                <div className={styles.pane}>
                  <div>
                    <h2>{slide.label}</h2>
                    {slide.count != null ? (
                      <p>
                        {t("gallery.productsCount", { count: slide.count })}
                      </p>
                    ) : null}
                  </div>
                  <Link
                    href={`/categories/${slide.categoryHandle}`}
                    className={styles.cta}
                    data-testid="hero-gallery-cta"
                  >
                    {t("gallery.shopCategory", {
                      category: slide.label.toLowerCase(),
                    })}
                  </Link>
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.tag}
                  onClick={() => setActive(i)}
                  aria-label={t("gallery.expandStrip", {
                    category: slide.label,
                  })}
                  data-testid="hero-gallery-strip-button"
                >
                  <span className={styles.tagLabel}>
                    {slide.label}
                    {slide.count != null ? (
                      <span className={styles.tagCount}> · {slide.count}</span>
                    ) : null}
                  </span>
                </button>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
