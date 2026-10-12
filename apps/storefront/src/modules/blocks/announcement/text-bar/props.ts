import type { PropsResult } from "../../types"
import type { LocalizedText } from "../../shared/localized-text"
import { parseHref, parseLocalizedText, parseProps } from "../../shared/parse"

export type TextBarProps = {
  text: LocalizedText
  /** A path inside the shop (`/store`, the locale is added) or an `https://` address. */
  href?: string | null
}

export function parseTextBarProps(input: unknown): PropsResult<TextBarProps> {
  return parseProps<TextBarProps>(input, "announcement/text-bar", {
    text: (value, path) => parseLocalizedText(value, path, { max: 140 }),
    href: (value, path) => parseHref(value, path),
  })
}
