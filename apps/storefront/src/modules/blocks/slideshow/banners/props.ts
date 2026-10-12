import type { PropsResult } from "../../types"
import { parseImageRef, type ImageRef } from "../../shared/image-ref"
import type { LocalizedText } from "../../shared/localized-text"
import { parseEnum, parseHref, parseInteger, parseList, parseLocalizedText, parseObject, parseProps } from "../../shared/parse"

export type SlideButton = {
  /** A path inside the shop (`/store`, the locale is added) or an `https://` address. */
  href: string
  label: LocalizedText
}

/** One banner: the shop's picture, and its words on a panel over it or under it. */
export type BannerSlide = {
  /** The banner's picture. When the shop does not have it, the slide is dropped. */
  image: ImageRef
  /** A phone's own crop of the banner, below 512 px; the `image` when absent or missing. */
  imageMobile: ImageRef | null
  heading: LocalizedText
  text: LocalizedText
  button: SlideButton | null
}

export type SlideshowBannersProps = {
  /** Two to five banners, one at a time. */
  slides: BannerSlide[]
  /** The picture's frame: 224 / 288 / 384 px on a phone, 400 / 560 / 640 px from 1024. */
  height: "small" | "medium" | "large"
  /** Seconds each banner stays, 5 to 10, or null: the banners move only when the visitor moves them. */
  autoplay: number | null
  /** What stands under the banners: the dots, the previous and next arrows, or both. */
  controls: "both" | "dots" | "arrows"
  /** The carousel's name for a screen reader. */
  label: LocalizedText
  /** Each banner's and each dot's name; `{index}` becomes its number and `{count}` the number of banners. */
  slideLabel: LocalizedText
  previousLabel: LocalizedText
  nextLabel: LocalizedText
  /** The words of the one button that stops and restarts the autoplay. */
  pauseLabel: LocalizedText
  playLabel: LocalizedText
}

/** The block's own words while it is `lab` (BLOCK-CONTRACT.md §2): props, not the catalogs. */
export const BUTTON_LABEL: LocalizedText = { ru: "Смотреть", en: "Shop now" }
export const REGION_LABEL: LocalizedText = { ru: "Баннеры магазина", en: "Shop banners" }
export const SLIDE_LABEL: LocalizedText = { ru: "Баннер {index} из {count}", en: "Banner {index} of {count}" }
export const PREVIOUS_LABEL: LocalizedText = { ru: "Предыдущий баннер", en: "Previous banner" }
export const NEXT_LABEL: LocalizedText = { ru: "Следующий баннер", en: "Next banner" }
export const PAUSE_LABEL: LocalizedText = { ru: "Остановить смену баннеров", en: "Stop the banners" }
export const PLAY_LABEL: LocalizedText = { ru: "Запустить смену баннеров", en: "Start the banners" }

const chrome = (fallback: LocalizedText) => (value: unknown, path: string) =>
  parseLocalizedText(value, path, { max: 60, fallback })

const parseSlide = (value: unknown, path: string) =>
  parseObject<BannerSlide>(value, path, {
    image: (image, imagePath) => parseImageRef(image, imagePath),
    imageMobile: (image, imagePath) => parseImageRef(image, imagePath, { optional: true }),
    heading: (heading, headingPath) => parseLocalizedText(heading, headingPath, { max: 60, fallback: {} }),
    text: (text, textPath) => parseLocalizedText(text, textPath, { max: 140, fallback: {} }),
    button: (button, buttonPath) =>
      parseObject<SlideButton>(
        button,
        buttonPath,
        {
          href: (href, hrefPath) => parseHref(href, hrefPath, { required: true }),
          label: (label, labelPath) => parseLocalizedText(label, labelPath, { max: 30, fallback: BUTTON_LABEL }),
        },
        { optional: true }
      ),
  })

/** Off when absent or null, else a whole number of seconds: under 5 a banner cannot be read. */
const parseAutoplay = (value: unknown, path: string): PropsResult<number | null> =>
  value === undefined || value === null ? { ok: true, value: null } : parseInteger(value, path, { min: 5, max: 10 })

/** A banner's name must say which one it is, or every banner and every dot would read the same. */
const parseSlideLabel = (value: unknown, path: string): PropsResult<LocalizedText> => {
  const result = chrome(SLIDE_LABEL)(value, path)
  if (!result.ok) return result
  const missing = Object.entries(result.value)
    .filter(([, line]) => !line.includes("{index}"))
    .map(([code]) => `${path}.${code} must contain {index}`)
  return missing.length ? { ok: false, errors: missing } : result
}

export function parseSlideshowBannersProps(input: unknown): PropsResult<SlideshowBannersProps> {
  return parseProps<SlideshowBannersProps>(input, "slideshow/banners", {
    slides: (value, path) => parseList(value, path, parseSlide, { min: 2, max: 5 }),
    height: (value, path) => parseEnum(value, path, ["small", "medium", "large"] as const, { fallback: "medium" }),
    autoplay: parseAutoplay,
    controls: (value, path) => parseEnum(value, path, ["both", "dots", "arrows"] as const, { fallback: "both" }),
    label: chrome(REGION_LABEL),
    slideLabel: parseSlideLabel,
    previousLabel: chrome(PREVIOUS_LABEL),
    nextLabel: chrome(NEXT_LABEL),
    pauseLabel: chrome(PAUSE_LABEL),
    playLabel: chrome(PLAY_LABEL),
  })
}

/** `{index}` and `{count}` of a banner's name filled in; `index` counts from 0. */
export const nameSlide = (template: string, index: number, count: number) =>
  template.replaceAll("{index}", String(index + 1)).replaceAll("{count}", String(count))
