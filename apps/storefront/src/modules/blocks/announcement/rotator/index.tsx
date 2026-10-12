import { getLocale } from "next-intl/server"

import { pickText, type LocalizedText } from "../../shared/localized-text"
import {
  CLOSE_LABEL,
  NEXT_LABEL,
  PREVIOUS_LABEL,
  REGION_LABEL,
  dismissKey,
  type RotatorProps,
} from "./props"
import RotatorBar, { type RotatorLine } from "./rotator-bar"

/**
 * `announcement/rotator` (t-2026-10-12-33, R1 build list item 16): two to five lines of the
 * shop's own news across the page, one at a time, each optionally a link. The sibling of
 * `announcement/text-bar` with the same colours (the theme's `--primary` pair) and the same
 * height (44px, `--layer-density` for its padding); measured against the Shopify catalogue's
 * `announcement-bar` (one centred line on the accent colour, arrows on the sides in Dawn,
 * a close button in Focal).
 *
 * The server picks each line in the visitor's language (else English, else any) and drops the
 * ones with nothing to say. None left: nothing is drawn. One left: a still bar like `text-bar`,
 * no arrows, the close button only when the owner asked for it. The rotation, the pause and the
 * dismissal are `./rotator-bar.tsx`'s.
 */
export default async function Rotator({
  messages,
  interval,
  dismissible,
  label,
  previousLabel,
  nextLabel,
  closeLabel,
}: RotatorProps) {
  const locale = await getLocale()
  const lines = messages.flatMap(({ text, href }): RotatorLine[] => {
    const line = pickText(text, locale)
    return line ? [{ text: line, href }] : []
  })

  if (lines.length === 0) {
    return null
  }

  const words = (text: LocalizedText, fallback: LocalizedText) =>
    pickText(text, locale) ?? pickText(fallback, locale) ?? ""

  return (
    <RotatorBar
      lines={lines}
      interval={interval}
      dismissible={dismissible}
      storageKey={dismissKey(messages)}
      labels={{
        region: words(label, REGION_LABEL),
        previous: words(previousLabel, PREVIOUS_LABEL),
        next: words(nextLabel, NEXT_LABEL),
        close: words(closeLabel, CLOSE_LABEL),
      }}
    />
  )
}
