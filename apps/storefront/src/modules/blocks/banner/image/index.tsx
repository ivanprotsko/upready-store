import { clx } from "@medusajs/ui"
import Image from "next/image"
import { getLocale } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { resolveImageRef, type BlockImage } from "@lib/data/block-image"

import BlockSection from "../../shared/block-section"
import { pickText } from "../../shared/localized-text"
import { SECTION_TYPE } from "../../shared/section-type"
import type { ContentPosition, ImageBannerProps } from "./props"

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"

const BUTTON_CLASS = {
  "cta-primary": clx(
    "inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] border px-6 text-base font-medium transition-opacity hover:opacity-90 motion-reduce:transition-none small:text-sm",
    "border-[var(--layer-button-border,var(--primary))] bg-[var(--layer-button-bg,var(--primary))] text-[var(--layer-button-fg,var(--primary-foreground))]",
    focusRing
  ),
  // A link, as in `text/rich-text`: a second outlined button outweighs the first on a template whose button
  // layer is outlined in `--border` (ferrite), so the secondary stays text with an underline.
  "cta-secondary": clx(
    "inline-flex min-h-11 items-center rounded-[var(--radius)] px-1 text-base font-medium underline decoration-[var(--muted-foreground)] decoration-1 underline-offset-4 transition-colors hover:decoration-[var(--foreground)] motion-reduce:transition-none small:text-sm",
    focusRing
  ),
} as const

/**
 * The banner's height over the picture, from 512 px (`xsmall`) and, when the words do not go under the
 * picture, below it too; `adapt` has none, the picture's own ratio sets it. A floor, not a height: the
 * section grows when the words need more, so nothing is ever clipped. Times `--layer-density`: a compact
 * template's banner is lower, a spacious one's taller.
 */
const BANNER_HEIGHT = {
  small: {
    always: "min-h-[calc(18rem*var(--layer-density,1))] small:min-h-[calc(26rem*var(--layer-density,1))]",
    fromXsmall: "xsmall:min-h-[calc(18rem*var(--layer-density,1))] small:min-h-[calc(26rem*var(--layer-density,1))]",
  },
  medium: {
    always: "min-h-[calc(22rem*var(--layer-density,1))] small:min-h-[calc(35rem*var(--layer-density,1))]",
    fromXsmall: "xsmall:min-h-[calc(22rem*var(--layer-density,1))] small:min-h-[calc(35rem*var(--layer-density,1))]",
  },
  large: {
    always: "min-h-[calc(26rem*var(--layer-density,1))] small:min-h-[calc(45rem*var(--layer-density,1))]",
    fromXsmall: "xsmall:min-h-[calc(26rem*var(--layer-density,1))] small:min-h-[calc(45rem*var(--layer-density,1))]",
  },
  adapt: { always: "", fromXsmall: "" },
} as const

/** The picture's own height on a phone when the words go under it. */
const STACKED_PICTURE_HEIGHT = {
  small: "min-h-[calc(12rem*var(--layer-density,1))] xsmall:min-h-0",
  medium: "min-h-[calc(15rem*var(--layer-density,1))] xsmall:min-h-0",
  large: "min-h-[calc(18rem*var(--layer-density,1))] xsmall:min-h-0",
  adapt: "",
} as const

type Vertical = "top" | "center" | "bottom"
type Horizontal = "left" | "center" | "right"

/** `bottom-right` is bottom and right; `center` is center both ways. */
const axes = (position: ContentPosition) =>
  (position === "center" ? ["center", "center"] : position.split("-")) as [Vertical, Horizontal]

/** Where the words stand in the banner: the content row's flex alignment, one axis each. */
const ROW_VERTICAL: Record<Vertical, string> = { top: "items-start", center: "items-center", bottom: "items-end" }
const ROW_HORIZONTAL: Record<Horizontal, string> = { left: "justify-start", center: "justify-center", right: "justify-end" }

/** The words aligned with their side, the buttons with them. */
const TEXT_ALIGN: Record<Horizontal, { text: string; buttons: string }> = {
  left: { text: "items-start text-left", buttons: "" },
  center: { text: "items-center text-center", buttons: "justify-center" },
  right: { text: "items-end text-right", buttons: "justify-end" },
}

/**
 * `banner/image` (t-2026-10-12-33, R1 build list item 7): a picture across the page with a heading, a text
 * and up to two buttons, anywhere on the home page, where until now a banner existed only as the hero slot.
 * Measured against the Shopify catalogue's image-banner (Trade, `13-image-banner--trade.jpg`; Dawn's 12
 * settings), our own tokens throughout.
 *
 * - The picture is an `ImageRef`, `imageMobile` another one below 512 px. With no `image`, or one the shop
 *   does not have, the block draws nothing.
 * - Height: small, medium or large as a floor that grows with the words, or `adapt`, the picture's own
 *   ratio. Medusa keeps no dimensions, so `adapt` learns the ratio when the picture loads.
 * - The overlay is a `--background` layer, 0–80 %, never black; the words are `--foreground`, so the pair
 *   follows a light and a dark template alike. Straight on the picture, the parser holds the overlay at
 *   65 % or more (`MIN_BARE_OVERLAY`); on the card (`textBox`) any overlay reads. The first button wears the
 *   template's button layer, the second is an underlined link.
 * - Nine places for the words, the text aligned with its side. `stackOnMobile` puts them under the picture
 *   below 512 px, on the page's background.
 *
 * The heading and the text are the section type of `shared/section-type.ts`, so a page keeps one size per
 * role (QR-TYPE-ROLE). One departure: straight on the picture the text is `--foreground`, not the role's
 * `--muted-foreground`, which over a 65 % layer falls below 4.5:1 on a white or black spot in every palette.
 * The full width is `BlockSection`'s; the words stay in the content container.
 */
export default async function ImageBanner({
  image,
  imageMobile,
  heading,
  text,
  primary,
  secondary,
  height,
  overlay,
  contentPosition,
  textBox,
  stackOnMobile,
}: ImageBannerProps) {
  if (!image) {
    return null
  }
  const locale = await getLocale()
  const [picture, phonePicture] = await Promise.all([
    resolveImageRef(image, locale),
    imageMobile ? resolveImageRef(imageMobile, locale) : null,
  ])
  if (!picture) {
    return null
  }

  const title = pickText(heading, locale)
  const body = pickText(text, locale)
  const buttons = (
    [
      ["cta-primary", primary],
      ["cta-secondary", secondary],
    ] as const
  ).flatMap(([role, button]) => {
    const label = button ? pickText(button.label, locale) : null
    return button && label ? [{ role, href: button.href, label }] : []
  })
  const hasWords = Boolean(title || body || buttons.length)
  const [vertical, horizontal] = axes(contentPosition)
  const align = TEXT_ALIGN[horizontal]
  const adapt = height === "adapt"

  const drawPicture = (source: BlockImage, shown: string) =>
    adapt ? (
      <Image
        src={source.url}
        alt={source.alt}
        width={0}
        height={0}
        sizes="100vw"
        className={clx("block h-full w-full object-cover", shown)}
      />
    ) : (
      <Image src={source.url} alt={source.alt} fill sizes="100vw" className={clx("object-cover", shown)} />
    )

  return (
    <BlockSection block="banner/image" locale={locale} width="full">
      <div
        className={clx(
          "grid",
          stackOnMobile ? BANNER_HEIGHT[height].fromXsmall : BANNER_HEIGHT[height].always
        )}
      >
        <div
          data-role="hero-image"
          className={clx(
            "overflow-hidden [grid-area:1/1]",
            !adapt && "relative",
            stackOnMobile && STACKED_PICTURE_HEIGHT[height]
          )}
        >
          {phonePicture ? (
            <>
              {drawPicture(phonePicture, "xsmall:hidden")}
              {drawPicture(picture, "hidden xsmall:block")}
            </>
          ) : (
            drawPicture(picture, "")
          )}
        </div>
        {overlay > 0 ? (
          <div
            aria-hidden="true"
            className={clx("relative bg-[var(--background)] [grid-area:1/1]", stackOnMobile && "hidden xsmall:block")}
            style={{ opacity: overlay / 100 }}
          />
        ) : null}
        {hasWords ? (
          <div
            className={clx(
              "content-container relative flex text-[var(--foreground)]",
              stackOnMobile
                ? "pt-6 [grid-area:2/1] xsmall:py-[calc(2rem*var(--layer-density,1))] xsmall:[grid-area:1/1] small:py-[calc(3rem*var(--layer-density,1))]"
                : "py-[calc(2rem*var(--layer-density,1))] [grid-area:1/1] small:py-[calc(3rem*var(--layer-density,1))]",
              ROW_VERTICAL[vertical],
              ROW_HORIZONTAL[horizontal]
            )}
          >
            <div
              className={clx(
                "flex max-w-xl flex-col gap-[calc(1rem*var(--layer-density,1))]",
                align.text,
                textBox &&
                  (stackOnMobile
                    ? "xsmall:rounded-[var(--radius)] xsmall:bg-[var(--background)] xsmall:p-8 small:p-12"
                    : "rounded-[var(--radius)] bg-[var(--background)] p-6 xsmall:p-8 small:p-12")
              )}
            >
              {title ? (
                <h2 data-role="headline" className={SECTION_TYPE.heading}>
                  {title}
                </h2>
              ) : null}
              {body ? (
                <p
                  data-role="description"
                  className={clx(SECTION_TYPE.description, "whitespace-pre-line", !textBox && "text-[var(--foreground)]")}
                >
                  {body}
                </p>
              ) : null}
              {buttons.length ? (
                <div
                  data-role="cta-group"
                  className={clx(
                    "mt-[calc(0.5rem*var(--layer-density,1))] flex flex-wrap items-center gap-x-6 gap-y-3",
                    align.buttons
                  )}
                >
                  {buttons.map(({ role, href, label }) =>
                    href.startsWith("/") ? (
                      <Link key={role} href={href} data-role={role} className={BUTTON_CLASS[role]}>
                        {label}
                      </Link>
                    ) : (
                      <a key={role} data-role={role} href={href} className={BUTTON_CLASS[role]}>
                        {label}
                      </a>
                    )
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </BlockSection>
  )
}
