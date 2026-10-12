import type { PropsResult } from "../../types"
import { parseImageRef, type ImageRef } from "../../shared/image-ref"
import type { LocalizedText } from "../../shared/localized-text"
import {
  parseBoolean,
  parseEnum,
  parseHref,
  parseList,
  parseLocalizedText,
  parseObject,
  parseProps,
} from "../../shared/parse"

export type HeroTypeButton = {
  /** A path inside the shop (`/store`, the locale is added) or an `https://` address. */
  href: string
  label: LocalizedText
}

export type HeroTypeProps = {
  eyebrow: LocalizedText
  /**
   * The page's `h1`, drawn very large. A line break in the text is kept, so a template can set
   * its own break («Коллекция\nосень-зима»). With no line in the visitor's language, nor in
   * English, nor in any other, the block draws nothing.
   */
  title: LocalizedText
  /** One short line under the headline. */
  lead: LocalizedText
  primary: HeroTypeButton | null
  /** Up to three small pictures under the headline; one that does not resolve is skipped, none leaves the headline alone. */
  images: ImageRef[]
  align: "left" | "center"
  /** `huge` takes the headline to the top of the type scale: 48 px on a phone, 96 px from 1280 px. */
  scale: "large" | "huge"
  /** A thin line under the eyebrow, drawn only with an eyebrow. */
  rule: boolean
}

/** The button's own words while the block is `lab` (BLOCK-CONTRACT.md §2): props, not the catalogs. */
export const PRIMARY_LABEL: LocalizedText = { ru: "Смотреть коллекцию", en: "See the collection" }

export function parseHeroTypeProps(input: unknown): PropsResult<HeroTypeProps> {
  return parseProps<HeroTypeProps>(input, "hero/type", {
    eyebrow: (value, path) => parseLocalizedText(value, path, { max: 40, fallback: {} }),
    title: (value, path) => parseLocalizedText(value, path, { max: 70 }),
    lead: (value, path) => parseLocalizedText(value, path, { max: 140, fallback: {} }),
    primary: (value, path) =>
      parseObject<HeroTypeButton>(
        value,
        path,
        {
          href: (href, hrefPath) => parseHref(href, hrefPath, { required: true }),
          label: (label, labelPath) => parseLocalizedText(label, labelPath, { max: 30, fallback: PRIMARY_LABEL }),
        },
        { optional: true }
      ),
    images: (value, path) =>
      parseList(value, path, (image, imagePath) => parseImageRef(image, imagePath), { max: 3, fallback: [] }),
    align: (value, path) => parseEnum(value, path, ["left", "center"], { fallback: "left" }),
    scale: (value, path) => parseEnum(value, path, ["large", "huge"], { fallback: "large" }),
    rule: (value, path) => parseBoolean(value, path, { fallback: false }),
  })
}
