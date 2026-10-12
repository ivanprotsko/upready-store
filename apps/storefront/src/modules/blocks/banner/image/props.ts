import type { PropsResult } from "../../types"
import { parseImageRef, type ImageRef } from "../../shared/image-ref"
import type { LocalizedText } from "../../shared/localized-text"
import { parseBoolean, parseEnum, parseHref, parseInteger, parseLocalizedText, parseObject, parseProps } from "../../shared/parse"

/** A button of the banner: its words and where it leads (`/…` in the shop, or `https://…`). */
export type ImageBannerButton = { label: LocalizedText; href: string }

/** Where the words stand on the picture: top, center or bottom × left, center or right. */
export const CONTENT_POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "center-left",
  "center",
  "center-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const

export type ContentPosition = (typeof CONTENT_POSITIONS)[number]

export type ImageBannerProps = {
  /** The picture. Absent, or a product or category the shop does not have: the block draws nothing. */
  image: ImageRef | null
  /** Another picture below 512 px, a crop made for a phone. Optional. */
  imageMobile: ImageRef | null
  heading: LocalizedText
  /** Plain text under the heading; a line break is kept. */
  text: LocalizedText
  primary: ImageBannerButton | null
  secondary: ImageBannerButton | null
  /** A fixed height of three, or `adapt`: the picture's own ratio. The section grows when the words need more. */
  height: "small" | "medium" | "large" | "adapt"
  /** How much of the picture a `--background` layer covers, 0–80 %. */
  overlay: number
  contentPosition: ContentPosition
  /** The words on a `--background` card with the template's radius, rather than straight on the picture. */
  textBox: boolean
  /** Below 512 px the words go under the picture, on the page's own background. */
  stackOnMobile: boolean
}

/** The buttons' own words while the block is `lab` (BLOCK-CONTRACT.md §2). */
export const PRIMARY_LABEL: LocalizedText = { ru: "В каталог", en: "Shop now" }
export const SECONDARY_LABEL: LocalizedText = { ru: "Подробнее", en: "Learn more" }

/**
 * The least overlay under words that sit straight on the picture (`textBox: false`). The worst picture is
 * pure white or pure black behind the text; over it, `--foreground` on a 65 % `--background` layer stands at
 * 4.58:1 or more in all 21 palette and mode pairs of `styles/themes.css`, so the text holds WCAG AA whatever
 * the picture. Below that the words go on the card.
 */
export const MIN_BARE_OVERLAY = 65

const optionalText = (max: number) => (value: unknown, path: string) =>
  parseLocalizedText(value, path, { max, fallback: {} })

const button = (fallback: LocalizedText) => (value: unknown, path: string) =>
  parseObject<ImageBannerButton>(
    value,
    path,
    {
      label: (label, labelPath) => parseLocalizedText(label, labelPath, { max: 30, fallback }),
      href: (href, hrefPath) => parseHref(href, hrefPath, { required: true }),
    },
    { optional: true }
  )

const hasWords = (text: LocalizedText) => Object.values(text).some((line) => line.trim())

export function parseImageBannerProps(input: unknown): PropsResult<ImageBannerProps> {
  const result = parseProps<ImageBannerProps>(input, "banner/image", {
    image: (value, path) => parseImageRef(value, path, { optional: true }),
    imageMobile: (value, path) => parseImageRef(value, path, { optional: true }),
    heading: optionalText(90),
    text: optionalText(280),
    primary: button(PRIMARY_LABEL),
    secondary: button(SECONDARY_LABEL),
    height: (value, path) => parseEnum(value, path, ["small", "medium", "large", "adapt"] as const, { fallback: "medium" }),
    overlay: (value, path) => parseInteger(value, path, { min: 0, max: 80, fallback: 0 }),
    contentPosition: (value, path) => parseEnum(value, path, CONTENT_POSITIONS, { fallback: "center" }),
    textBox: (value, path) => parseBoolean(value, path, { fallback: true }),
    stackOnMobile: (value, path) => parseBoolean(value, path, { fallback: true }),
  })
  if (!result.ok) return result
  const { heading, text, primary, secondary, overlay, textBox } = result.value
  const wordsOnPicture = hasWords(heading) || hasWords(text) || primary !== null || secondary !== null
  if (!textBox && wordsOnPicture && overlay < MIN_BARE_OVERLAY) {
    return {
      ok: false,
      errors: [
        `overlay is ${overlay}: words straight on the picture (textBox: false) need at least ${MIN_BARE_OVERLAY} to read on any picture; raise it or set textBox: true`,
      ],
    }
  }
  return result
}
