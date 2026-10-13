import { clx } from "@medusajs/ui"
import Image from "next/image"
import { getLocale } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { resolveImageRef } from "@lib/data/block-image"

import BlockSection from "../../shared/block-section"
import { pickText } from "../../shared/localized-text"
import { SECTION_TYPE } from "../../shared/section-type"
import type { ImageWithTextProps } from "./props"

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"

const BUTTON_CLASS = clx(
  "inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] border px-6 text-base font-medium transition-opacity hover:opacity-90 motion-reduce:transition-none small:text-sm",
  "border-[var(--layer-button-border,var(--primary))] bg-[var(--layer-button-bg,var(--primary))] text-[var(--layer-button-fg,var(--primary-foreground))]",
  focusRing
)

/**
 * The row's columns from 1024 px, by the picture's share and side: the picture's column comes
 * first in the source (it stacks on top), so a picture on the right is the second column.
 * From 720 to 1023 px every row is halved, `min-[720px]:grid-cols-2`.
 */
const COLUMNS: Record<ImageWithTextProps["imageWidth"], Record<ImageWithTextProps["imageSide"], string>> = {
  "1/3": { left: "small:grid-cols-[1fr_2fr]", right: "small:grid-cols-[2fr_1fr]" },
  "1/2": { left: "", right: "" },
  "2/3": { left: "small:grid-cols-[2fr_1fr]", right: "small:grid-cols-[1fr_2fr]" },
}

/** What the browser fetches: the picture's share of the viewport at each width. */
const SIZES: Record<ImageWithTextProps["imageWidth"], string> = {
  "1/3": "(min-width: 1024px) 33vw, (min-width: 720px) 50vw, 100vw",
  "1/2": "(min-width: 1024px) 50vw, (min-width: 720px) 50vw, 100vw",
  "2/3": "(min-width: 1024px) 66vw, (min-width: 720px) 50vw, 100vw",
}

/** `auto` is the template's photo layer; the others are its `portrait` and `landscape` ratios. */
const ASPECT: Record<ImageWithTextProps["imageAspect"], string> = {
  auto: "aspect-[var(--layer-photo-aspect,1/1)]",
  square: "aspect-square",
  portrait: "aspect-[3/4]",
  landscape: "aspect-[4/3]",
}

const JUSTIFY: Record<ImageWithTextProps["verticalAlign"], string> = {
  top: "justify-start",
  center: "justify-center",
  bottom: "justify-end",
}

/**
 * `media/image-with-text` (t-2026-10-12-33, R1 build list item 2): a picture beside the shop's
 * words, the section 13 of 18 Shopify themes carry, up to four in a row. The picture is an
 * `ImageRef`, a product's or a category's own picture or a file of the template, resolved
 * through the shop's loaders; beside it an eyebrow, a heading, plain text and one button.
 *
 * - On a phone the picture stacks above the words. From 720 px they stand side by side, the
 *   picture on `imageSide`, halved; from 1024 px the picture takes `imageWidth` of the row. A
 *   template alternates the sides of consecutive sections itself.
 * - The picture's frame keeps `imageAspect` (`auto`: the template's `--layer-photo-aspect`) and
 *   grows with the words when they are taller, the picture covering it.
 * - `verticalAlign` stands the words at the top, centre or bottom of the row; `tone: "muted"`
 *   puts them on a `--muted` panel as tall as the row.
 *
 * The type is the shell's, `SECTION_TYPE` of `shared/section-type.ts` (BLOCK-CONTRACT.md §3), as
 * rich-text's is: 12 / 16 / 16 / 24 px at 360 (eyebrow, button, text, heading) and 12 / 14 / 18 /
 * 32 px from 1024. The text keeps its own leading and line breaks.
 *
 * With no heading and no text in any language it draws nothing; with no picture (no ref, or the
 * product, category or file is not there) it draws the words alone across the container.
 */
export default async function ImageWithText({
  image,
  eyebrow,
  heading,
  text,
  button,
  imageSide,
  imageWidth,
  imageAspect,
  verticalAlign,
  tone,
}: ImageWithTextProps) {
  const locale = await getLocale()
  const title = pickText(heading, locale)
  const body = pickText(text, locale)

  if (!title && !body) {
    return null
  }

  const picture = image ? await resolveImageRef(image, locale) : null
  const label = pickText(eyebrow, locale)
  const buttonText = button ? pickText(button.label, locale) : null

  const words = (
    <div
      className={clx(
        "flex min-w-0 flex-col gap-[var(--layer-space-6,1.5rem)]",
        JUSTIFY[verticalAlign],
        tone === "muted" &&
          "rounded-[var(--radius)] bg-[var(--muted)] px-6 py-[var(--layer-space-8,2rem)] small:px-12 small:py-[var(--layer-space-12,3rem)]"
      )}
    >
      {label ? (
        <p data-role="label" className={SECTION_TYPE.label}>
          {label}
        </p>
      ) : null}
      {title ? (
        <h2 data-role="heading" className={clx("max-w-2xl", SECTION_TYPE.heading)}>
          {title}
        </h2>
      ) : null}
      {body ? (
        <p data-role="description" className={clx(SECTION_TYPE.description, "max-w-prose whitespace-pre-line leading-relaxed")}>
          {body}
        </p>
      ) : null}
      {button && buttonText ? (
        <div className="mt-[var(--layer-space-3,0.75rem)] flex">
          {button.href.startsWith("/") ? (
            <Link href={button.href} data-role="cta-primary" className={BUTTON_CLASS}>
              {buttonText}
            </Link>
          ) : (
            <a data-role="cta-primary" href={button.href} className={BUTTON_CLASS}>
              {buttonText}
            </a>
          )}
        </div>
      ) : null}
    </div>
  )

  return (
    <BlockSection block="media/image-with-text" locale={locale}>
      {picture ? (
        <div
          className={clx(
            "grid grid-cols-1 gap-y-6 min-[720px]:grid-cols-2 min-[720px]:gap-x-8 small:gap-x-12",
            COLUMNS[imageWidth][imageSide]
          )}
        >
          <div
            data-role="media"
            className={clx(
              "relative overflow-hidden rounded-[var(--radius)] bg-[var(--muted)]",
              imageSide === "right" && "min-[720px]:order-last"
            )}
          >
            <div aria-hidden className={ASPECT[imageAspect]} />
            <Image src={picture.url} alt={picture.alt} fill sizes={SIZES[imageWidth]} className="object-cover" />
          </div>
          {words}
        </div>
      ) : (
        words
      )}
    </BlockSection>
  )
}
