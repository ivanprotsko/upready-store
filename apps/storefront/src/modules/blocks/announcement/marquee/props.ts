import type { PropsResult } from "../../types"
import { parseIcon, type BlockIconName } from "../../shared/icon-name"
import type { LocalizedText } from "../../shared/localized-text"
import {
  parseEnum,
  parseHref,
  parseList,
  parseLocalizedText,
  parseObject,
  parseProps,
} from "../../shared/parse"

/** One point of the line: its words, an icon of `shared/icon-name.ts` before them, where it leads. */
export type MarqueeItem = {
  text: LocalizedText
  icon: BlockIconName | null
  href: string | null
}

export const MARQUEE_SPEEDS = ["slow", "normal"] as const
export const MARQUEE_DIRECTIONS = ["left", "right"] as const
export const MARQUEE_SEPARATORS = ["dot", "star", "icon"] as const
export const MARQUEE_TONES = ["plain", "inverted", "accent"] as const

export type MarqueeProps = {
  /** One to eight points, run in a loop. */
  items: MarqueeItem[]
  speed: (typeof MARQUEE_SPEEDS)[number]
  /** `left`: the line runs from right to left, the way it is read. */
  direction: (typeof MARQUEE_DIRECTIONS)[number]
  /** The mark before each point: a dot, a star, or the point's own icon (a dot where it has none). */
  separator: (typeof MARQUEE_SEPARATORS)[number]
  /** `plain` on the theme's muted surface, `inverted` in the page's colours swapped, `accent` on `--primary`. */
  tone: (typeof MARQUEE_TONES)[number]
  /** The line's name for a screen reader. */
  label: LocalizedText
}

/** The line's own words while the block is `lab` (BLOCK-CONTRACT.md §2). */
export const REGION_LABEL: LocalizedText = {
  ru: "Предложения магазина",
  en: "Shop offers",
}

/** An icon is optional on a point: absent is null, any other value must be a name of the list. */
const parseOptionalIcon = (value: unknown, path: string): PropsResult<BlockIconName | null> =>
  value === undefined || value === null ? { ok: true, value: null } : parseIcon(value, path)

export function parseMarqueeProps(input: unknown): PropsResult<MarqueeProps> {
  return parseProps<MarqueeProps>(input, "announcement/marquee", {
    items: (value, path) =>
      parseList(
        value,
        path,
        (item, itemPath) =>
          parseObject<MarqueeItem>(item, itemPath, {
            text: (text, textPath) => parseLocalizedText(text, textPath, { max: 90 }),
            icon: parseOptionalIcon,
            href: (href, hrefPath) => parseHref(href, hrefPath),
          }),
        { min: 1, max: 8 }
      ),
    speed: (value, path) => parseEnum(value, path, MARQUEE_SPEEDS, { fallback: "normal" }),
    direction: (value, path) => parseEnum(value, path, MARQUEE_DIRECTIONS, { fallback: "left" }),
    separator: (value, path) => parseEnum(value, path, MARQUEE_SEPARATORS, { fallback: "dot" }),
    tone: (value, path) => parseEnum(value, path, MARQUEE_TONES, { fallback: "plain" }),
    label: (value, path) => parseLocalizedText(value, path, { max: 60, fallback: REGION_LABEL }),
  })
}

/** A point in the visitor's language, as the component draws it. */
export type MarqueeLine = { text: string; icon: BlockIconName | null; href: string | null }

/** Pixels a second: slow is half of normal. */
export const PIXELS_PER_SECOND = { slow: 30, normal: 60 } as const

/** The widest screen the loop fills without a gap at its end; a wider one sees the track end once a lap. */
export const FILL_WIDTH = 2560

/** 14px text: the average glyph of a Latin or Cyrillic sans is about 0.55em. */
const GLYPH = 7.7
/** The icon and its gap before the words (16 + 8). */
const ICON = 24
/** The mark and the space on both sides of it (`--layer-space-6` twice, at most a 12px star). */
const MARK = 60

/**
 * How the loop is laid out, worked out on the server so the browser runs it in CSS alone:
 * - `sets`, how many times the points stand in one copy of the track, so that a copy is at least
 *   `FILL_WIDTH` wide and the second copy closes the loop with no gap; a point is never narrower than
 *   its mark, so one short point stands at most 38 times;
 * - `seconds`, how long one copy takes to pass, from an estimate of its width, so the speed in
 *   pixels a second is the same for one short point and for eight long ones.
 * The width is estimated from the characters: the server knows no font metrics. A copy that comes out
 * wider or narrower in the real font only runs a little faster or slower.
 */
export function marqueeLoop(
  lines: MarqueeLine[],
  separator: MarqueeProps["separator"],
  speed: MarqueeProps["speed"]
): { sets: number; seconds: number } {
  const width = lines.reduce(
    (sum, line) =>
      sum + line.text.length * GLYPH + MARK + (line.icon && separator !== "icon" ? ICON : 0),
    0
  )
  const sets = Math.max(1, Math.ceil(FILL_WIDTH / width))
  return { sets, seconds: Math.round((sets * width) / PIXELS_PER_SECOND[speed]) }
}
