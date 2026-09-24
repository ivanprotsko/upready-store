import { getTranslations } from "next-intl/server"

import { Link } from "@i18n/navigation"

import type { OlavkaHeroSlide } from "./olavka-types"
import styles from "./olavka-hero-slider.module.css"

type Props = {
  slides: OlavkaHeroSlide[]
}

/**
 * HeroSliders · Olavka (t-2026-09-24-n15), Figma 238:17551 «HeroSliders», the
 * `Device × Items × Swiped` set: banner cards on a native scroll-snap track. One banner
 * fills the content width (1168 / 672 / 336); two sit side by side at 1216 (572×400 each,
 * gap 24) and scroll below; three or more scroll on every device — 572-wide cards
 * centred with the previous and next peeking (288 wide, radius 24, on a phone), the
 * node's `Swiped=true` state being any scroll position past the first card. The node
 * draws no arrows and no dots, so there are none: a finger swipes, a wheel or a trackpad
 * scrolls, and the Tab key walks the cards and scrolls each into view. No client state,
 * so this is a server component. One deliberate difference from the desktop `Items=2+`
 * frame: it shows a previous banner peeking already at rest (an endless loop); here the
 * first card starts at the left padding, the way the tablet `Swiped=false` frame does.
 *
 * Every card is ONE link over the whole picture (Ivan 2.3): the four chips are plain
 * spans inside it — the «Смотреть» button is decorative, never a second control — and
 * the link's own focus ring is the card's outline. A product link opens the product
 * page in the current locale (`Link`); a URL link opens as given, a `http(s)://` one in
 * a new tab with `rel="noopener noreferrer"`, a site path in the same tab.
 */
export default async function OlavkaHeroSliderCarousel({ slides }: Props) {
  const t = await getTranslations("OlavkaHome.slider")
  // Layout by the NUMBER of banners (Ivan 2026-09-25, set 238:17551 `Items=1 / 2 / 2+`):
  // one → a single full-width card; two → a pair on desktop, a carousel below; three or
  // more → a carousel with the neighbours peeking on every device.
  const layout = slides.length === 1 ? "single" : slides.length === 2 ? "pair" : "carousel"

  return (
    <section
      className={styles.slider}
      aria-label={t("label")}
      data-testid="olavka-hero-slider"
      data-layout={layout}
    >
      <ul className={`${styles.track} ${styles[layout]}`}>
        {slides.map((slide, index) => (
          <li
            key={slide.id}
            className={styles.item}
            data-testid="olavka-hero-slide"
            data-source={slide.source}
          >
            <BannerCard slide={slide} eager={index < 2} />
          </li>
        ))}
      </ul>
    </section>
  )
}

const SIZES = "(max-width: 639px) 80vw, 572px"

function BannerCard({ slide, eager }: { slide: OlavkaHeroSlide; eager: boolean }) {
  const inner = (
    <>
      {slide.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- pre-cut variants in srcset (make-image-variants.mjs), the way the course cover is served; next/image would re-encode them.
        <img
          src={slide.image.src}
          srcSet={slide.image.srcSet ?? undefined}
          sizes={slide.image.srcSet ? SIZES : undefined}
          width={slide.image.width ?? undefined}
          height={slide.image.height ?? undefined}
          alt={slide.image.alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          className={styles.image}
        />
      ) : null}
      <span className={styles.border} aria-hidden />
      {slide.kicker ? (
        <span className={`${styles.chip} ${styles.kicker}`} data-testid="olavka-hero-slide-kicker">
          {slide.kicker}
        </span>
      ) : null}
      {slide.label ? (
        <span
          className={`${styles.chip} ${styles.chipDark} ${styles.label}`}
          data-testid="olavka-hero-slide-label"
        >
          {slide.label}
        </span>
      ) : null}
      {slide.title ? (
        <span
          className={`${styles.chip} ${styles.chipDark} ${styles.title}`}
          data-testid="olavka-hero-slide-title"
        >
          {slide.title}
        </span>
      ) : null}
      {slide.button ? (
        <span className={`${styles.chip} ${styles.button}`} data-testid="olavka-hero-slide-button">
          {slide.button}
        </span>
      ) : null}
    </>
  )

  if (slide.external) {
    return (
      <a
        href={slide.href}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.card}
        aria-label={slide.title}
        data-testid="olavka-hero-slide-link"
      >
        {inner}
      </a>
    )
  }

  return (
    <Link
      href={slide.href}
      className={styles.card}
      aria-label={slide.title}
      data-testid="olavka-hero-slide-link"
    >
      {inner}
    </Link>
  )
}
