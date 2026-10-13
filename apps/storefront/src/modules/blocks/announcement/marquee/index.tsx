import { clx } from "@medusajs/ui"
import { getLocale } from "next-intl/server"
import type { CSSProperties } from "react"

import { Link } from "@i18n/navigation"

import BlockIcon from "../../shared/block-icon"
import { pickText } from "../../shared/localized-text"
import styles from "./marquee.module.css"
import {
  REGION_LABEL,
  marqueeLoop,
  type MarqueeLine,
  type MarqueeProps,
} from "./props"

const TONES: Record<MarqueeProps["tone"], string> = {
  plain: "bg-[var(--muted)] text-[var(--foreground)]",
  inverted: "bg-[var(--foreground)] text-[var(--background)]",
  accent: "bg-[var(--primary)] text-[var(--primary-foreground)]",
}

/** The bonus and discount marks of the icon list: a point that leads with one is a bonus note. */
const BONUS_ICONS = new Set(["gift", "percent"])

const MARK_SPACE = "mx-[var(--layer-space-6,1.5rem)]"

const LINK_CLASS =
  "rounded-[var(--radius)] underline decoration-1 underline-offset-4 hover:decoration-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[currentColor]"

/**
 * One point and the mark before it. `echo` is a repeat of a point already said: hidden from a screen
 * reader and out of the tab order (`inert`), and gone under `prefers-reduced-motion`. `first` is the
 * line's first point, whose dot or star nothing precedes when the line stands still.
 */
function Point({
  line,
  separator,
  echo,
  first,
}: {
  line: MarqueeLine
  separator: MarqueeProps["separator"]
  echo: boolean
  first: boolean
}) {
  const ownMark = separator === "icon" && line.icon
  const mark = ownMark ? (
    <BlockIcon name={line.icon!} className={clx(MARK_SPACE, "h-4 w-4 shrink-0")} />
  ) : separator === "star" ? (
    <BlockIcon
      name="star"
      className={clx(MARK_SPACE, "h-3 w-3 shrink-0 fill-current", first && "motion-reduce:hidden")}
    />
  ) : (
    <span
      aria-hidden="true"
      className={clx(MARK_SPACE, "h-1 w-1 shrink-0 rounded-full bg-current", first && "motion-reduce:hidden")}
    />
  )
  const words = line.href ? (
    line.href.startsWith("/") ? (
      <Link href={line.href} data-role="nav-link" tabIndex={echo ? -1 : undefined} className={LINK_CLASS}>
        {line.text}
      </Link>
    ) : (
      <a href={line.href} data-role="nav-link" tabIndex={echo ? -1 : undefined} className={LINK_CLASS}>
        {line.text}
      </a>
    )
  ) : (
    line.text
  )

  return (
    <li
      aria-hidden={echo || undefined}
      inert={echo || undefined}
      className={clx("flex shrink-0 items-center motion-reduce:shrink", echo && styles.echo)}
    >
      {mark}
      <span className="flex items-center gap-2">
        {line.icon && !ownMark ? <BlockIcon name={line.icon} className="h-4 w-4 shrink-0" /> : null}
        <span
          data-role={line.icon && BONUS_ICONS.has(line.icon) ? "bonus-badge" : "description"}
          className="whitespace-nowrap motion-reduce:whitespace-normal"
        >
          {words}
        </span>
      </span>
    </li>
  )
}

/**
 * `announcement/marquee` (t-2026-10-12-33, R2 build list item 10): a running line of the shop's short
 * promises across the page, «Дарим 500 бонусов на первую покупку · Бесплатная доставка от 3000 ₽».
 * Measured against InSales Cream and Vibe (`scrolling-text`, 37 and 46px high): one line of points
 * with a mark between them. A sibling of `announcement/text-bar` and `announcement/rotator`: the same
 * 44px height, the density layer's `--layer-space-2` for its padding, 14px type.
 *
 * The server picks each point in the visitor's language (else English, else any) and drops the ones
 * with nothing to say; none left, nothing is drawn. It repeats the points until one copy of the track
 * fills a 2560px screen and sets the lap's duration from their length (`marqueeLoop`), so the browser
 * runs the loop in CSS alone (`./marquee.module.css`), with no timer and no layout shift. The second copy
 * and the repeats are `aria-hidden` and `inert`: a screen reader and the Tab key meet each point once.
 */
export default async function Marquee({ items, speed, direction, separator, tone, label }: MarqueeProps) {
  const locale = await getLocale()
  const lines = items.flatMap(({ text, icon, href }): MarqueeLine[] => {
    const line = pickText(text, locale)
    return line ? [{ text: line, icon, href }] : []
  })

  if (lines.length === 0) {
    return null
  }

  const { sets, seconds } = marqueeLoop(lines, separator, speed)
  const copy = (echo: boolean) =>
    Array.from({ length: sets }, (_, set) =>
      lines.map((line, index) => (
        <Point
          key={`${set}-${index}`}
          line={line}
          separator={separator}
          echo={echo || set > 0}
          first={!echo && set === 0 && index === 0}
        />
      ))
    )

  return (
    <section
      data-block="announcement/marquee"
      aria-label={pickText(label, locale) ?? pickText(REGION_LABEL, locale) ?? undefined}
      className={clx(
        styles.bar,
        "flex min-h-11 w-full items-center overflow-hidden py-[var(--layer-space-2,0.5rem)] text-sm",
        TONES[tone]
      )}
    >
      <div
        data-role="marquee"
        className={clx(styles.track, direction === "right" && styles.right)}
        style={{ "--marquee-duration": `${seconds}s` } as CSSProperties}
      >
        <ul className="flex shrink-0 items-center motion-reduce:w-full motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:gap-y-1 motion-reduce:px-4 motion-reduce:text-center">
          {copy(false)}
        </ul>
        <ul aria-hidden="true" inert className={clx(styles.echo, "flex shrink-0 items-center")}>
          {copy(true)}
        </ul>
      </div>
    </section>
  )
}
