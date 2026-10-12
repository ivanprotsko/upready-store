import type { PropsResult } from "../../types"
import { parseImageRef, type ImageRef } from "../../shared/image-ref"
import type { LocalizedText } from "../../shared/localized-text"
import { parseEnum, parseHref, parseLocalizedText, parseObject, parseProps } from "../../shared/parse"

/** A link beside the code: its words and where it leads (`/…` in the shop, or `https://…`). */
export type PromoCodeButton = { label: LocalizedText; href: string }

export type PromoCodeBannerProps = {
  /** The code as the promotion in the panel has it: 3–20 of A–Z and 0–9. Absent: the block draws nothing. */
  code: string | null
  headline: LocalizedText
  /** Plain text under the headline. Optional. */
  text: LocalizedText
  /** The offer in a word or two above the headline: «−10 %», «Новым покупателям». Optional. */
  badge: LocalizedText
  /** The small print: «Один раз на покупателя, от 3 000 ₽». Optional. */
  terms: LocalizedText
  /**
   * The last day, `2027-06-30`, which ends at midnight Moscow time, or a moment with its offset,
   * `2027-06-30T23:59:00+03:00`. Past it the block draws nothing.
   */
  expires: string | null
  /** Optional: a link beside the code, «В каталог». */
  button: PromoCodeButton | null
  /** A picture beside the words; the `card` layout only. */
  image: ImageRef | null
  /** `plain`: the page's colours inside a `--border` frame. `accent`: a `--primary` panel. `inverted`: a `--foreground` panel. */
  tone: "plain" | "accent" | "inverted"
  /** `card`: a panel with the words, and a picture beside them if given. `inline`: one band, the words and the code in a row. */
  layout: "card" | "inline"
  copyLabel: LocalizedText
  /** Said for 2 s after a copy, on the button and through `aria-live`. */
  copiedLabel: LocalizedText
  /** Said through `aria-live` when the browser cannot copy and the code is selected instead. */
  selectedLabel: LocalizedText
  /** The code field's name for a screen reader. */
  codeLabel: LocalizedText
  /** Before the expiry date: «Действует до 30 июня 2027 г.». */
  expiresLabel: LocalizedText
}

/** The block's own words while it is `lab` (BLOCK-CONTRACT.md §2). */
export const HEADLINE: LocalizedText = { ru: "Скидка по промокоду", en: "A discount with this code" }
export const COPY_LABEL: LocalizedText = { ru: "Скопировать", en: "Copy" }
export const COPIED_LABEL: LocalizedText = { ru: "Скопировано", en: "Copied" }
export const SELECTED_LABEL: LocalizedText = { ru: "Код выделен, скопируйте его", en: "The code is selected; copy it" }
export const CODE_LABEL: LocalizedText = { ru: "Промокод", en: "Promo code" }
export const EXPIRES_LABEL: LocalizedText = { ru: "Действует до", en: "Valid until" }
export const BUTTON_LABEL: LocalizedText = { ru: "В каталог", en: "Shop now" }

/** What a promotion code of the panel may be: capitals and digits, 3 to 20. */
export const CODE_PATTERN = /^[A-Z0-9]{3,20}$/

const ISO = /^(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/

/**
 * When the code stops: a date alone runs to the end of its day in Moscow, the storefront's market; a
 * template for another zone gives the moment with its offset. No expiry: never.
 */
export function expiresAt(expires: string | null): number {
  if (!expires) return Infinity
  if (expires.length === 10) return Date.parse(`${expires}T00:00:00+03:00`) + 24 * 60 * 60 * 1000
  return Date.parse(expires)
}

const parseCode = (value: unknown, path: string): PropsResult<string | null> => {
  if (value === undefined || value === null || value === "") return { ok: true, value: null }
  return typeof value === "string" && CODE_PATTERN.test(value)
    ? { ok: true, value }
    : { ok: false, errors: [`${path} must be 3 to 20 characters of A–Z and 0–9, as the promotion in the panel has it`] }
}

const parseExpires = (value: unknown, path: string): PropsResult<string | null> => {
  if (value === undefined || value === null) return { ok: true, value: null }
  const match = typeof value === "string" ? value.match(ISO) : null
  // A real day: 2027-02-29 rolls over to 1 March and is refused.
  const day = match ? new Date(Date.UTC(+match[1], +match[2] - 1, +match[3])) : null
  const real = !!day && day.getUTCFullYear() === +match![1] && day.getUTCMonth() === +match![2] - 1 && day.getUTCDate() === +match![3]
  return real && !Number.isNaN(expiresAt(value as string))
    ? { ok: true, value: value as string }
    : {
        ok: false,
        errors: [`${path} must be an ISO date, 2027-06-30, or a date and time with its offset, 2027-06-30T23:59:00+03:00`],
      }
}

const optionalText = (max: number) => (value: unknown, path: string) =>
  parseLocalizedText(value, path, { max, fallback: {} })

const chrome = (max: number, fallback: LocalizedText) => (value: unknown, path: string) =>
  parseLocalizedText(value, path, { max, fallback })

export function parsePromoCodeBannerProps(input: unknown): PropsResult<PromoCodeBannerProps> {
  const read = parseProps<PromoCodeBannerProps>(input, "promo/code-banner", {
    code: parseCode,
    headline: chrome(90, HEADLINE),
    text: optionalText(240),
    badge: optionalText(24),
    terms: optionalText(160),
    expires: parseExpires,
    button: (value, path) =>
      parseObject<PromoCodeButton>(
        value,
        path,
        {
          label: chrome(30, BUTTON_LABEL),
          href: (href, hrefPath) => parseHref(href, hrefPath, { required: true }),
        },
        { optional: true }
      ),
    image: (value, path) => parseImageRef(value, path, { optional: true }),
    tone: (value, path) => parseEnum(value, path, ["plain", "accent", "inverted"] as const, { fallback: "plain" }),
    layout: (value, path) => parseEnum(value, path, ["card", "inline"] as const, { fallback: "card" }),
    copyLabel: chrome(20, COPY_LABEL),
    copiedLabel: chrome(20, COPIED_LABEL),
    selectedLabel: chrome(60, SELECTED_LABEL),
    codeLabel: chrome(30, CODE_LABEL),
    expiresLabel: chrome(30, EXPIRES_LABEL),
  })
  if (read.ok && read.value.image && read.value.layout === "inline") {
    return { ok: false, errors: ["image: the inline layout draws no picture; use layout card or leave the image out"] }
  }
  return read
}
