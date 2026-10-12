import type { PropsResult } from "../../types"
import { parseImageRef, type ImageRef } from "../../shared/image-ref"
import type { LocalizedText } from "../../shared/localized-text"
import { parseBoolean, parseEnum, parseHref, parseLocalizedText, parseObject, parseProps } from "../../shared/parse"
import { parseVideoUrl, TEMPLATE_VIDEO, type VideoSource } from "./video"

/** The section's one button: its words and where it leads (`/…` in the shop, or `https://…`). */
export type VideoEmbedButton = { label: LocalizedText; href: string }

export type VideoEmbedProps = {
  /**
   * A YouTube, VK Video or Rutube link, or a clip of the template under `/templates/<id>/`. Absent, or
   * a link the block does not take: the block draws nothing.
   */
  video: VideoSource | null
  /** What stands in the frame until the visitor presses play. A link without one draws nothing. */
  cover: ImageRef | null
  heading: LocalizedText
  /** Plain text; a line break inside it is kept. */
  text: LocalizedText
  button: VideoEmbedButton | null
  /** The play button's name for a screen reader. */
  playLabel: LocalizedText
  /** Where the words stand: above the video, or beside it from 1024 px. At full width they stand above. */
  textPosition: "above" | "left" | "right"
  aspect: "16/9" | "4/3" | "9/16"
  /** `full`: the video takes the page's width, the words stay in the container. */
  width: "container" | "full"
  /** For a clip of the template only: a provider's player takes neither. */
  loop: boolean
  muted: boolean
}

/** The play button's own name while the block is `lab` (BLOCK-CONTRACT.md §2). */
export const PLAY_LABEL: LocalizedText = { ru: "Смотреть видео", en: "Play the video" }

/** The button's own words while the block is `lab`. */
export const BUTTON_LABEL: LocalizedText = { ru: "Подробнее", en: "Learn more" }

const SOURCES = ["url", "file"] as const

const optionalText = (max: number) => (value: unknown, path: string) =>
  parseLocalizedText(value, path, { max, fallback: {} })

function parseVideoSource(value: unknown, path: string): PropsResult<VideoSource | null> {
  if (value === undefined || value === null) return { ok: true, value: null }
  const given = typeof value === "object" && !Array.isArray(value) ? SOURCES.filter((key) => key in value) : []
  if (given.length !== 1) return { ok: false, errors: [`${path} must name exactly one of: ${SOURCES.join(", ")}`] }
  if (given[0] === "url") {
    return parseObject<{ url: string }>(value, path, {
      url: (url, urlPath) =>
        typeof url === "string" && parseVideoUrl(url)
          ? { ok: true, value: url }
          : {
              ok: false,
              errors: [`${urlPath} must be a YouTube, VK Video or Rutube link (https, the video's own page or embed address)`],
            },
    })
  }
  return parseObject<{ file: string }>(value, path, {
    file: (file, filePath) =>
      typeof file === "string" && TEMPLATE_VIDEO.test(file)
        ? { ok: true, value: file }
        : { ok: false, errors: [`${filePath} must be /templates/<template-id>/<file>.(mp4|webm)`] },
  })
}

export function parseVideoEmbedProps(input: unknown): PropsResult<VideoEmbedProps> {
  const result = parseProps<VideoEmbedProps>(input, "video/embed", {
    video: parseVideoSource,
    cover: (value, path) => parseImageRef(value, path, { optional: true }),
    heading: optionalText(120),
    text: optionalText(400),
    button: (value, path) =>
      parseObject<VideoEmbedButton>(
        value,
        path,
        {
          label: (label, labelPath) => parseLocalizedText(label, labelPath, { max: 30, fallback: BUTTON_LABEL }),
          href: (href, hrefPath) => parseHref(href, hrefPath, { required: true }),
        },
        { optional: true }
      ),
    playLabel: (value, path) => parseLocalizedText(value, path, { max: 40, fallback: PLAY_LABEL }),
    textPosition: (value, path) => parseEnum(value, path, ["above", "left", "right"] as const, { fallback: "above" }),
    aspect: (value, path) => parseEnum(value, path, ["16/9", "4/3", "9/16"] as const, { fallback: "16/9" }),
    width: (value, path) => parseEnum(value, path, ["container", "full"] as const, { fallback: "container" }),
    loop: (value, path) => parseBoolean(value, path, { fallback: false }),
    muted: (value, path) => parseBoolean(value, path, { fallback: false }),
  })
  if (result.ok && result.value.video && "url" in result.value.video && (result.value.loop || result.value.muted)) {
    return { ok: false, errors: ["loop and muted apply to a file of the template only"] }
  }
  return result
}
