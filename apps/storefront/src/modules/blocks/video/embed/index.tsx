import { clx } from "@medusajs/ui"
import { getLocale } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { resolveImageRef } from "@lib/data/block-image"

import BlockSection from "../../shared/block-section"
import { pickText } from "../../shared/localized-text"
import { SECTION_TYPE } from "../../shared/section-type"
import VideoPlayer from "./player"
import type { VideoEmbedProps } from "./props"
import { mediaOf } from "./video"

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"

const BUTTON_CLASS = clx(
  "inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] border px-6 text-base font-medium transition-opacity hover:opacity-90 motion-reduce:transition-none small:text-sm",
  "border-[var(--layer-button-border,var(--primary))] bg-[var(--layer-button-bg,var(--primary))] text-[var(--layer-button-fg,var(--primary-foreground))]",
  focusRing
)

const ASPECT: Record<VideoEmbedProps["aspect"], string> = {
  "16/9": "aspect-video",
  "4/3": "aspect-[4/3]",
  // A phone's upright clip stays a narrow column, so its frame never outgrows the screen.
  "9/16": "mx-auto aspect-[9/16] max-w-sm",
}

/** The row from 1024 px, by where the words stand: the words come first in the source (they stack on top). */
const COLUMNS: Record<"left" | "right", string> = {
  left: "small:grid-cols-[1fr_2fr]",
  right: "small:grid-cols-[2fr_1fr]",
}

/** What the browser fetches for the cover: the frame's share of the viewport. */
const sizesOf = (aspect: VideoEmbedProps["aspect"], beside: boolean, full: boolean) =>
  aspect === "9/16" ? "(min-width: 416px) 384px, 100vw" : full ? "100vw" : beside ? "(min-width: 1024px) 66vw, 100vw" : "100vw"

/**
 * `video/embed` (t-2026-10-12-33, R1 build list item 11): a video with a cover, the section 6 of 18
 * Shopify themes carry. The video is a YouTube, VK Video or Rutube link, read against a strict
 * allow-list (`video.ts`), or a clip of the template under `/templates/<id>/`.
 *
 * - Privacy: the cover, an `ImageRef` of the shop or the template, stands in the frame with a play
 *   button, and the provider's player (`youtube-nocookie.com`, `vk.com/video_ext.php`,
 *   `rutube.ru/play/embed`) is put in only after the press (`player.tsx`). Before it the page asks the
 *   provider for nothing.
 * - The frame keeps `aspect`; 9/16 stands as a column at most 24rem wide. `width: "full"` gives the video
 *   the page's width, square-cornered, with the words above it in the container.
 * - The words, a heading and a text, stand above the video or beside it from 1024 px (`textPosition`),
 *   in the shell's type (`SECTION_TYPE`), with the template's one button under them.
 * - `loop` and `muted` apply to a clip of the template.
 *
 * With no video, a link the block does not take, or a link whose cover is not there, it draws nothing:
 * there is nothing to show before the press but a grey box. A clip without a cover shows its own first
 * frame.
 */
export default async function VideoEmbed({
  video,
  cover,
  heading,
  text,
  button,
  playLabel,
  textPosition,
  aspect,
  width,
  loop,
  muted,
}: VideoEmbedProps) {
  const media = video ? mediaOf(video, { loop, muted }) : null
  if (!media) {
    return null
  }

  const locale = await getLocale()
  const picture = cover ? await resolveImageRef(cover, locale) : null
  if (!picture && media.kind === "frame") {
    return null
  }

  const full = width === "full"
  const title = pickText(heading, locale)
  const body = pickText(text, locale)
  const buttonText = button ? pickText(button.label, locale) : null
  const label = pickText(playLabel, locale) ?? ""
  const hasWords = Boolean(title || body || (button && buttonText))
  const beside = hasWords && !full && textPosition !== "above"

  const words = hasWords ? (
    <div className={clx("flex min-w-0 flex-col gap-[var(--layer-space-4,1rem)]", full && "content-container")}>
      {title ? (
        <h2 data-role="headline" className={clx(SECTION_TYPE.heading, "max-w-2xl")}>
          {title}
        </h2>
      ) : null}
      {body ? (
        <p data-role="description" className={clx(SECTION_TYPE.description, "max-w-prose whitespace-pre-line leading-relaxed")}>
          {body}
        </p>
      ) : null}
      {button && buttonText ? (
        <div className="mt-[var(--layer-space-2,0.5rem)] flex">
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
  ) : null

  const player = (
    <VideoPlayer
      media={media}
      cover={picture ? { url: picture.url, alt: picture.alt } : null}
      title={title ?? label}
      playLabel={label}
      frameClass={clx("relative block w-full overflow-hidden bg-[var(--muted)]", ASPECT[aspect], !full && "rounded-[var(--radius)]")}
      sizes={sizesOf(aspect, beside, full)}
    />
  )

  return (
    <BlockSection block="video/embed" locale={locale} width={full ? "full" : "content"}>
      {beside ? (
        <div
          className={clx(
            "grid grid-cols-1 gap-y-[var(--layer-space-6,1.5rem)] small:items-center small:gap-x-12",
            COLUMNS[textPosition]
          )}
        >
          <div className={clx(textPosition === "right" && "small:order-last")}>{words}</div>
          <div className="min-w-0">{player}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-[var(--layer-space-6,1.5rem)]">
          {words}
          {player}
        </div>
      )}
    </BlockSection>
  )
}
