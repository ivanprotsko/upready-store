import { clx } from "@medusajs/ui"
import Image, { getImageProps } from "next/image"
import { getLocale } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { resolveImageRef, type BlockImage } from "@lib/data/block-image"

import BlockSection from "../../shared/block-section"
import { pickText, type LocalizedText } from "../../shared/localized-text"
import { SECTION_TYPE } from "../../shared/section-type"
import SlideshowCarousel from "./carousel"
import {
  NEXT_LABEL,
  PAUSE_LABEL,
  PLAY_LABEL,
  PREVIOUS_LABEL,
  REGION_LABEL,
  SLIDE_LABEL,
  nameSlide,
  type SlideshowBannersProps,
} from "./props"

/**
 * The template's button layer (`--layer-button-*`), the theme's primary pair without a template. 14 px from 1024
 * like the section's «see all» (`SECTION_TYPE.seeAll`): beside the 18 px line, 16 px would stand 1.125× apart, under
 * the scale's 1.15 (QR-TYPE-SCALE).
 */
const BUTTON =
  "inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius)] border border-[var(--layer-button-border,var(--primary))] bg-[var(--layer-button-bg,var(--primary))] px-6 text-base font-medium text-[var(--layer-button-fg,var(--primary-foreground))] small:text-sm hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] motion-safe:transition-colors xsmall:w-auto"

/**
 * The picture's frame, a ratio at a phone, from 512 px and from 1024 px: one crop per width (QR-IMG-ASPECT). At
 * 1280 px that is 411 / 493 / 616 px high, at 360 px 219 / 262 / 328. From 1024 px the frame is never lower than
 * 384 px, so the card panel always has room over it.
 */
const FRAME = {
  small: "aspect-[3/2] xsmall:aspect-[5/2] small:aspect-[3/1]",
  medium: "aspect-[5/4] xsmall:aspect-[2/1] small:aspect-[5/2]",
  large: "aspect-square xsmall:aspect-[3/2] small:aspect-[2/1]",
} as const

type Banner = {
  image: BlockImage
  mobile: BlockImage | null
  heading: string | null
  text: string | null
  button: { href: string; label: string } | null
}

/**
 * The banner's picture across its frame. With a phone crop, one `<picture>`: the browser fetches
 * only the source its width asks for, which two `next/image` side by side would not.
 */
function Picture({ image, mobile, first }: { image: BlockImage; mobile: BlockImage | null; first: boolean }) {
  if (!mobile) {
    return <Image src={image.url} alt={image.alt} fill priority={first} sizes="100vw" className="object-cover" />
  }
  const common = { alt: image.alt, fill: true, priority: first, sizes: "100vw" } as const
  const wide = getImageProps({ ...common, src: image.url }).props
  const narrow = getImageProps({ ...common, src: mobile.url }).props
  return (
    <picture>
      <source media="(min-width: 512px)" srcSet={wide.srcSet} sizes={wide.sizes} />
      {/* eslint-disable-next-line @next/next/no-img-element -- art direction: next/image draws no <picture>; getImageProps gives the same optimised sources */}
      <img {...narrow} alt={image.alt} className="object-cover" />
    </picture>
  )
}

/**
 * One banner: the picture in the frame of the template's `height`, in the page's content measure with the
 * theme's radius, and its words under it on a phone and a tablet, on a panel of the theme's card surface over
 * its lower left corner from 1024 px. The panel keeps the words readable over any photo in any palette without
 * a scrim, which would be a colour of its own.
 *
 * The measure is the content container's (`globals.css`: `px-4 lg:px-6`, and `lg` is `small`'s 1024), not its
 * class: `template:check` reads every `.content-container` for one left edge (QR-GRID-AXES), and the banners
 * out of view stand a whole banner's width to the right of the one in view. Its gutters are where the
 * carousel's track fades out (`./carousel.tsx`), and its box carries the ring of a focused slide.
 */
function Slide({ banner, height, first }: { banner: Banner; height: SlideshowBannersProps["height"]; first: boolean }) {
  const { heading, text, button } = banner
  return (
    <div className="mx-auto w-full max-w-screen-large px-4 small:px-6">
      <div className="relative rounded-[var(--radius)] group-focus-visible/slide:outline group-focus-visible/slide:outline-2 group-focus-visible/slide:outline-offset-2 group-focus-visible/slide:outline-[var(--ring)]">
        <div
          data-role="hero-image"
          className={clx("relative w-full overflow-hidden rounded-[var(--radius)] small:min-h-96", FRAME[height])}
        >
          <Picture image={banner.image} mobile={banner.mobile} first={first} />
        </div>
        {heading || text || button ? (
          <div className="pt-[var(--layer-space-6,1.5rem)] small:absolute small:inset-0 small:flex small:items-end small:p-8">
            <div className="flex max-w-xl flex-col items-start gap-[var(--layer-space-4,1rem)] small:rounded-[var(--radius)] small:bg-[var(--card)] small:p-8 small:text-[var(--card-foreground)]">
              {heading ? (
                <h2 data-role="headline" className={SECTION_TYPE.heading}>
                  {heading}
                </h2>
              ) : null}
              {text ? (
                <p data-role="description" className={SECTION_TYPE.description}>
                  {text}
                </p>
              ) : null}
              {button ? (
                button.href.startsWith("/") ? (
                  <Link data-role="cta-primary" href={button.href} className={BUTTON}>
                    {button.label}
                  </Link>
                ) : (
                  <a data-role="cta-primary" href={button.href} className={BUTTON}>
                    {button.label}
                  </a>
                )
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * `slideshow/banners` (t-2026-10-12-33, R1 build list item 9): two to five of the shop's banners in the
 * page's content measure, one at a time, each a picture with a heading, a line and one button. The general
 * form of the Olavka slider, measured against the Shopify catalogue's `slideshow` (8 of its themes: a wide
 * picture in a full-width or a grid layout, boxed text, dots and arrows under it, an autoplay that holds on
 * hover).
 *
 * The server resolves every picture (`ImageRef`), a phone crop beside it when the template gives one, and
 * drops a banner whose picture the shop does not have. None left: nothing is drawn. One left: a still
 * banner, with no carousel, no controls and no timer. Two or more: `./carousel.tsx`.
 *
 * The heading is an `h2` in the section type (`SECTION_TYPE.heading`): the block is not the hero slot, so
 * the page keeps its one `h1`, and every section title of a template's page is one size (QR-TYPE-ROLE).
 */
export default async function SlideshowBanners({
  slides,
  height,
  autoplay,
  controls,
  label,
  slideLabel,
  previousLabel,
  nextLabel,
  pauseLabel,
  playLabel,
}: SlideshowBannersProps) {
  const locale = await getLocale()
  const resolved = await Promise.all(
    slides.map(async (slide): Promise<Banner | null> => {
      const [image, mobile] = await Promise.all([
        resolveImageRef(slide.image, locale),
        slide.imageMobile ? resolveImageRef(slide.imageMobile, locale) : null,
      ])
      if (!image) return null
      const buttonLabel = slide.button ? pickText(slide.button.label, locale) : null
      return {
        image,
        mobile,
        heading: pickText(slide.heading, locale),
        text: pickText(slide.text, locale),
        button: slide.button && buttonLabel ? { href: slide.button.href, label: buttonLabel } : null,
      }
    })
  )
  const banners = resolved.filter((banner): banner is Banner => banner !== null)

  if (banners.length === 0) {
    return null
  }

  const drawn = banners.map((banner, index) => <Slide key={index} banner={banner} height={height} first={index === 0} />)

  if (drawn.length === 1) {
    return (
      <BlockSection block="slideshow/banners" locale={locale} width="full">
        {drawn[0]}
      </BlockSection>
    )
  }

  const words = (text: LocalizedText, fallback: LocalizedText) =>
    pickText(text, locale) ?? pickText(fallback, locale) ?? ""
  const name = words(slideLabel, SLIDE_LABEL)

  return (
    <BlockSection block="slideshow/banners" locale={locale} width="full">
      <SlideshowCarousel
        slides={drawn}
        names={drawn.map((_, index) => nameSlide(name, index, drawn.length))}
        autoplay={autoplay}
        controls={controls}
        labels={{
          region: words(label, REGION_LABEL),
          previous: words(previousLabel, PREVIOUS_LABEL),
          next: words(nextLabel, NEXT_LABEL),
          pause: words(pauseLabel, PAUSE_LABEL),
          play: words(playLabel, PLAY_LABEL),
        }}
      />
    </BlockSection>
  )
}
