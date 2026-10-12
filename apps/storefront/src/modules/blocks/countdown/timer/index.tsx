import { clx } from "@medusajs/ui"
import { getLocale } from "next-intl/server"

import { Link } from "@i18n/navigation"

import BlockSection from "../../shared/block-section"
import { pickText } from "../../shared/localized-text"
import { SECTION_TYPE } from "../../shared/section-type"
import { CountdownClock, CountdownGate } from "./clock"
import { BUTTON_LABEL, DAYS_LABEL, DEADLINE_LABEL, HOURS_LABEL, MINUTES_LABEL, SECONDS_LABEL, type CountdownTimerProps } from "./props"
import { formatDeadline, readInstant, remaining } from "./time"

const BUTTON_CLASS = clx(
  "inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] border px-6 text-base font-medium transition-opacity hover:opacity-90 motion-reduce:transition-none small:text-sm",
  "border-[var(--layer-button-border,var(--primary))] bg-[var(--layer-button-bg,var(--primary))] text-[var(--layer-button-fg,var(--primary-foreground))]",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
)

/**
 * `countdown/timer` (t-2026-10-12-33, R1 build list item 14): the time left to the end of a sale, with a
 * heading, a line and one button. Measured against the countdown sections of Shopify's Motion (a section of
 * its own) and Prestige (`countdown-condensed`, a strip): end date, hide the timer or show a message at the
 * end, a button. Our own tokens throughout.
 *
 * - `endsAt` is one moment, ISO 8601 with its offset. The server draws the days and hours left at its own
 *   moment, the minutes and seconds too, so the page does not move when the island takes over; the island
 *   (`clock.tsx`) starts from the server's moment and ticks once a second.
 * - `style: "block"`: the words, the clock in large cells on the card surface, the button, centred.
 *   `style: "inline"`: one bar in the content measure on the card surface; the words, the clock and the
 *   button side by side from 1024 px, one under another below it.
 * - After the end, on the server and on an open page alike: `afterEnd: "hide"` draws nothing, a message
 *   stands where the clock was and the heading, the line and the button stay. A missing or unreadable
 *   `endsAt` counts as ended.
 *
 * The heading and the line are the section type of `shared/section-type.ts`, so a page keeps one size per
 * role (QR-TYPE-ROLE). The numbers are 36 / 48 px in a block and 24 / 32 px in a bar, both on the type scale
 * and ≥ 1.15× from their neighbours (QR-TYPE-SCALE).
 */
export default async function CountdownTimer({
  endsAt,
  heading,
  text,
  button,
  afterEnd,
  style,
  daysLabel,
  hoursLabel,
  minutesLabel,
  secondsLabel,
  deadlineLabel,
}: CountdownTimerProps) {
  const locale = await getLocale()
  const now = Date.now()
  const instant = endsAt ? readInstant(endsAt) : null
  // An unreadable end is a past one: 0 is long gone.
  const at = instant?.at ?? 0
  const message = afterEnd === "hide" ? null : pickText(afterEnd.message, locale)

  if (!remaining(at, now) && !message) {
    return null
  }

  const title = pickText(heading, locale)
  const body = pickText(text, locale)
  const label = button ? (pickText(button.label, locale) ?? pickText(BUTTON_LABEL, locale)) : null
  const line = pickText(deadlineLabel, locale) ?? pickText(DEADLINE_LABEL, locale) ?? "{date}"
  const [before, after = ""] = line.split("{date}")
  const deadline =
    instant && endsAt ? { before, date: formatDeadline(instant.at, instant.offset, locale), after, dateTime: endsAt } : null
  const block = style === "block"

  const words =
    title || body ? (
      <div className={clx("flex flex-col gap-[var(--layer-space-3,0.75rem)]", block ? "max-w-2xl items-center" : "small:max-w-md")}>
        {title ? (
          <h2 data-role="heading" className={SECTION_TYPE.heading}>
            {title}
          </h2>
        ) : null}
        {body ? (
          <p data-role="description" className={clx(SECTION_TYPE.description, "whitespace-pre-line")}>
            {body}
          </p>
        ) : null}
      </div>
    ) : null

  const cta =
    button && label ? (
      button.href.startsWith("/") ? (
        <Link href={button.href} data-role="cta-primary" className={clx(BUTTON_CLASS, "shrink-0")}>
          {label}
        </Link>
      ) : (
        <a href={button.href} data-role="cta-primary" className={clx(BUTTON_CLASS, "shrink-0")}>
          {label}
        </a>
      )
    ) : null

  const clock = (
    <CountdownClock
      at={at}
      now={now}
      size={style}
      units={{
        days: pickText(daysLabel, locale) ?? pickText(DAYS_LABEL, locale) ?? "",
        hours: pickText(hoursLabel, locale) ?? pickText(HOURS_LABEL, locale) ?? "",
        minutes: pickText(minutesLabel, locale) ?? pickText(MINUTES_LABEL, locale) ?? "",
        seconds: pickText(secondsLabel, locale) ?? pickText(SECONDS_LABEL, locale) ?? "",
      }}
      deadline={deadline}
      message={message}
    />
  )

  const section = (
    <BlockSection block="countdown/timer" locale={locale} width="content">
      {block ? (
        <div className="flex flex-col items-center gap-[var(--layer-space-6,1.5rem)] text-center">
          {words}
          {clock}
          {cta}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-[var(--layer-space-4,1rem)] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-[var(--layer-space-6,1.5rem)] small:flex-row small:items-center small:justify-between small:gap-[var(--layer-space-8,2rem)]">
          {words}
          {clock}
          {cta}
        </div>
      )}
    </BlockSection>
  )

  return afterEnd === "hide" ? (
    <CountdownGate at={at} now={now}>
      {section}
    </CountdownGate>
  ) : (
    section
  )
}
