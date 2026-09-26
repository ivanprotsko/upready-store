import { getTranslations } from "next-intl/server"

import { Link } from "@i18n/navigation"

import OlavkaLoopTrack from "./olavka-loop-track"
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
 * draws no arrows and no dots: a finger swipes, a wheel or a trackpad scrolls, and the Tab
 * key walks the cards and scrolls each into view. No client state, so this is a server
 * component; the 3+ carousel loops (Ivan 2026-09-25, C3) through the small
 * `OlavkaLoopTrack` island — at rest the first card centred, the last peeking left — which
 * also draws round previous / next arrows on desktop, for a mouse with no horizontal
 * scroll (Ivan's remark 22).
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
      {layout === "carousel" ? (
        // 3+ banners loop (Ivan 2026-09-25): clone · real · clone, see OlavkaLoopTrack.
        <OlavkaLoopTrack
          className={`${styles.track} ${styles.carousel}`}
          setSize={slides.length}
          labels={{ previous: t("previous"), next: t("next") }}
        >
          {(["before", "real", "after"] as const).flatMap((copy) =>
            slides.map((slide, index) => {
              const clone = copy !== "real"
              return (
                // A clone is out of the tab order and the accessibility tree, but a click on
                // it opens its link (Ivan's remark 22): the neighbour peeking on either side
                // is often a clone — always the left one at rest — and `inert` made it dead.
                <li
                  key={`${copy}-${slide.id}`}
                  className={styles.item}
                  data-testid={clone ? "olavka-hero-slide-clone" : "olavka-hero-slide"}
                  data-source={slide.source}
                  data-copy={copy}
                  // The card left of the first real one at rest: kept in the server's first paint.
                  data-peek={(copy === "before" && index === slides.length - 1) || undefined}
                  aria-hidden={clone || undefined}
                >
                  <BannerCard
                    slide={slide}
                    eager={!clone ? index < 2 : index === slides.length - 1 && copy === "before"}
                    layout={layout}
                    clone={clone}
                  />
                </li>
              )
            })
          )}
        </OlavkaLoopTrack>
      ) : (
        <ul className={`${styles.track} ${styles[layout]}`}>
          {slides.map((slide, index) => (
            <li
              key={slide.id}
              className={styles.item}
              data-testid="olavka-hero-slide"
              data-source={slide.source}
            >
              <BannerCard slide={slide} eager={index < 2} layout={layout} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * The card's rendered width per layout, for `srcset`: phone 288 / 336, tablet 572 / 672,
 * desktop half / all of the 1440 container — and above 1440 the page is zoomed
 * (`lib/theme/olavka-zoom.ts`), so the desktop widths are in `vw` there, never in px.
 */
const SIZES = {
  single:
    "(max-width: 639px) calc(100vw - 24px), (max-width: 1023px) calc(100vw - 48px), (max-width: 1440px) calc(100vw - 48px), 97vw",
  pair: "(max-width: 639px) 80vw, (max-width: 1023px) 572px, (max-width: 1440px) calc(50vw - 36px), 48vw",
  carousel:
    "(max-width: 639px) 80vw, (max-width: 1023px) 572px, (max-width: 1440px) calc(50vw - 36px), 48vw",
} as const

/**
 * One «BannerLabel» of the node: the outer `surface` (4px ring, 7px padding; no background
 * blur since Ivan's remark 16) around the filled `inner`. An empty text →
 * no chip. The title keeps the editor's line breaks (`white-space: pre-line`).
 */
function Chip({
  text,
  className,
  testId,
}: {
  text: string | null
  className: string
  testId: string
}) {
  if (!text) {
    return null
  }
  return (
    <span className={`${styles.chip} ${className}`} data-testid={`olavka-hero-slide-${testId}`}>
      <span className={styles.inner}>
        <span className={styles.text}>{text}</span>
      </span>
    </span>
  )
}

function BannerCard({
  slide,
  eager,
  layout,
  clone = false,
}: {
  slide: OlavkaHeroSlide
  eager: boolean
  layout: keyof typeof SIZES
  /** A loop clone: clickable, never reached by Tab. */
  clone?: boolean
}) {
  const inner = (
    <>
      {slide.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- pre-cut variants in srcset (make-image-variants.mjs), the way the course cover is served; next/image would re-encode them.
        <img
          src={slide.image.src}
          srcSet={slide.image.srcSet ?? undefined}
          sizes={slide.image.srcSet ? SIZES[layout] : undefined}
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
      <Chip text={slide.kicker} className={`${styles.soft} ${styles.kicker}`} testId="kicker" />
      <Chip text={slide.label} className={`${styles.dark} ${styles.label}`} testId="label" />
      <Chip text={slide.title} className={`${styles.dark} ${styles.title}`} testId="title" />
      <Chip text={slide.button} className={`${styles.soft} ${styles.button}`} testId="button" />
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
        tabIndex={clone ? -1 : undefined}
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
      tabIndex={clone ? -1 : undefined}
      data-testid="olavka-hero-slide-link"
    >
      {inner}
    </Link>
  )
}
