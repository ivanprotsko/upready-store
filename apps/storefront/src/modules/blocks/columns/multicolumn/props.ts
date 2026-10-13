import type { PropsResult } from "../../types"
import { parseIcon, type BlockIconName } from "../../shared/icon-name"
import { parseImageRef, type ImageRef } from "../../shared/image-ref"
import type { LocalizedText } from "../../shared/localized-text"
import { parseEnum, parseHref, parseInteger, parseList, parseLocalizedText, parseObject, parseProps } from "../../shared/parse"
import { parseSectionHeader, type SectionHeader } from "../../shared/section-header"

export type MulticolumnItem = {
  /** A picture of the shop (`cards`), or a small mark next to the title (`icons`). Not with `icon`. */
  image: ImageRef | null
  /** An icon of `shared/icon-name.ts`. Not with `image`. */
  icon: BlockIconName | null
  /** Without one in any language the item is skipped. */
  title: LocalizedText
  text: LocalizedText
  link: { href: string; label: LocalizedText } | null
}

export type MulticolumnProps = {
  header: SectionHeader | null
  items: MulticolumnItem[]
  /** `icons`: a small icon above a short title, the trust row. `cards`: a picture with text. */
  mode: "icons" | "cards"
  /** Columns from 1024px, 2 to 6; never more than the items shown. */
  columns: number
  /** Under 512px: one column, two, or a row that swipes sideways. */
  mobile: "one" | "two" | "swipe"
  align: "left" | "center"
  /** `muted`: every column on a `--muted` card. */
  tone: "plain" | "muted"
}

/** The link's own words when a template gives none (BLOCK-CONTRACT.md §2: props, not the catalogs). */
export const LINK_LABEL: LocalizedText = { ru: "Подробнее", en: "Learn more" }

const item = (value: unknown, path: string): PropsResult<MulticolumnItem> => {
  const result = parseObject<MulticolumnItem>(value, path, {
    image: (v, p) => parseImageRef(v, p, { optional: true }),
    icon: (v, p) => (v === undefined || v === null ? { ok: true, value: null } : parseIcon(v, p)),
    title: (v, p) => parseLocalizedText(v, p, { max: 60 }),
    // Under 200 characters, so a column of a six-column row never holds the page's longest text (QR-COLUMN-RANK).
    text: (v, p) => parseLocalizedText(v, p, { max: 180, fallback: {} }),
    link: (v, p) =>
      parseObject<{ href: string; label: LocalizedText }>(
        v,
        p,
        {
          href: (href, hrefPath) => parseHref(href, hrefPath, { required: true }),
          label: (label, labelPath) => parseLocalizedText(label, labelPath, { max: 30, fallback: LINK_LABEL }),
        },
        { optional: true }
      ),
  })
  if (result.ok && result.value.image && result.value.icon) {
    return { ok: false, errors: [`${path}: image or icon, not both`] }
  }
  return result
}

export function parseMulticolumnProps(input: unknown): PropsResult<MulticolumnProps> {
  return parseProps<MulticolumnProps>(input, "columns/multicolumn", {
    header: (value, path) => parseSectionHeader(value, path),
    items: (value, path) => parseList(value, path, item, { min: 2, max: 6, fallback: [] }),
    mode: (value, path) => parseEnum(value, path, ["icons", "cards"], { fallback: "icons" }),
    columns: (value, path) => parseInteger(value, path, { min: 2, max: 6, fallback: 4 }),
    mobile: (value, path) => parseEnum(value, path, ["one", "two", "swipe"], { fallback: "one" }),
    align: (value, path) => parseEnum(value, path, ["left", "center"], { fallback: "left" }),
    tone: (value, path) => parseEnum(value, path, ["plain", "muted"], { fallback: "plain" }),
  })
}
