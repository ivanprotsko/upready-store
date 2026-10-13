import type { PropsResult } from "../../types"
import { parseImageRef, type ImageRef } from "../../shared/image-ref"
import type { LocalizedText } from "../../shared/localized-text"
import { parseEnum, parseHref, parseLocalizedText, parseObject, parseProps } from "../../shared/parse"

/** The section's one button: its words and where it leads (`/…` in the shop, or `https://…`). */
export type ImageWithTextButton = { label: LocalizedText; href: string }

export type ImageWithTextProps = {
  /** A product's or a category's picture, or a file of the template. Absent: text only. */
  image: ImageRef | null
  /** A short line above the heading, «Из чугуна». Optional. */
  eyebrow: LocalizedText
  heading: LocalizedText
  /** Plain text; a line break inside it is kept. */
  text: LocalizedText
  button: ImageWithTextButton | null
  /** Which side the picture stands on from 720 px; a template alternates it section by section. */
  imageSide: "left" | "right"
  /** The picture's share of the row from 1024 px; from 720 to 1023 px the row is halved. */
  imageWidth: "1/3" | "1/2" | "2/3"
  /** `auto` follows the template's photo layer (`--layer-photo-aspect`). */
  imageAspect: "auto" | "square" | "portrait" | "landscape"
  /** Where the words stand against the picture. */
  verticalAlign: "top" | "center" | "bottom"
  /** `muted`: the words stand on a `--muted` panel as tall as the picture. */
  tone: "plain" | "muted"
}

/** The button's own words while the block is `lab` (BLOCK-CONTRACT.md §2). */
export const BUTTON_LABEL: LocalizedText = { ru: "Подробнее", en: "Learn more" }

const optionalText = (max: number) => (value: unknown, path: string) =>
  parseLocalizedText(value, path, { max, fallback: {} })

export function parseImageWithTextProps(input: unknown): PropsResult<ImageWithTextProps> {
  return parseProps<ImageWithTextProps>(input, "media/image-with-text", {
    image: (value, path) => parseImageRef(value, path, { optional: true }),
    eyebrow: optionalText(40),
    heading: optionalText(120),
    text: optionalText(600),
    button: (value, path) =>
      parseObject<ImageWithTextButton>(
        value,
        path,
        {
          label: (label, labelPath) => parseLocalizedText(label, labelPath, { max: 30, fallback: BUTTON_LABEL }),
          href: (href, hrefPath) => parseHref(href, hrefPath, { required: true }),
        },
        { optional: true }
      ),
    imageSide: (value, path) => parseEnum(value, path, ["left", "right"] as const, { fallback: "left" }),
    imageWidth: (value, path) => parseEnum(value, path, ["1/3", "1/2", "2/3"] as const, { fallback: "1/2" }),
    imageAspect: (value, path) =>
      parseEnum(value, path, ["auto", "square", "portrait", "landscape"] as const, { fallback: "auto" }),
    verticalAlign: (value, path) => parseEnum(value, path, ["top", "center", "bottom"] as const, { fallback: "center" }),
    tone: (value, path) => parseEnum(value, path, ["plain", "muted"] as const, { fallback: "plain" }),
  })
}
