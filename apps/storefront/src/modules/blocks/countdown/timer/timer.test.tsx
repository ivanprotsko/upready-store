import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BLOCKS, CATEGORY_BLOCKS, blockById } from "../../registry"
import { SECTION_TYPE } from "../../shared/section-type"
import CountdownTimer from "."
import { timer } from "./block"
import { DEADLINE_LABEL, ENDED_MESSAGE, parseCountdownTimerProps, type CountdownTimerProps } from "./props"
import { formatDeadline, offsetLabel, pad, readInstant, remaining, untilNextTick } from "./time"

vi.mock("server-only", () => ({}))

const state = vi.hoisted(() => ({ locale: "ru" }))
vi.mock("next-intl/server", () => ({ getLocale: async () => state.locale }))
vi.mock("@i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={`/ru${href}`} {...rest}>
      {children}
    </a>
  ),
}))

const ENDS = "2026-11-30T23:59:00+03:00"
const ENDS_AT = Date.UTC(2026, 10, 30, 20, 59)
const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const render = async (props: CountdownTimerProps) => {
  const tree = await CountdownTimer(props)
  return tree === null ? null : renderToStaticMarkup(tree)
}

const sample = timer.fixtures!.sample
const at = (now: number) => vi.setSystemTime(now)

beforeEach(() => {
  state.locale = "ru"
  vi.useFakeTimers({ toFake: ["Date"] })
})
afterEach(() => {
  vi.useRealTimers()
})

describe("countdown/timer time maths", () => {
  it("reads an ISO date and time with its offset as one moment", () => {
    expect(readInstant(ENDS)).toEqual({ at: ENDS_AT, offset: 180 })
    expect(readInstant("2026-11-30T20:59Z")).toEqual({ at: ENDS_AT, offset: 0 })
    expect(readInstant("2026-11-30T15:29:00.250-05:30")).toEqual({ at: ENDS_AT, offset: -330 })
  })

  it("refuses a date without an offset, a day the month lacks and anything out of range", () => {
    for (const value of [
      "2026-11-30T23:59:00",
      "2026-11-30",
      "2026-02-30T12:00:00+03:00",
      "2026-13-01T12:00:00+03:00",
      "2026-11-30T24:00:00+03:00",
      "2026-11-30T23:60:00+03:00",
      "2026-11-30T23:59:60+03:00",
      "2026-11-30T23:59:00+15:00",
      "2026-11-30T23:59:00+03:60",
      "30.11.2026 23:59",
      "",
    ]) {
      expect(readInstant(value), value).toBeNull()
    }
    expect(readInstant("2028-02-29T00:00:00+00:00")).not.toBeNull()
  })

  it("splits what is left into days, hours, minutes and seconds, rounded up to the second", () => {
    expect(remaining(ENDS_AT, ENDS_AT - (2 * DAY + 3 * HOUR + 4 * MINUTE + 5 * SECOND))).toEqual({
      days: 2,
      hours: 3,
      minutes: 4,
      seconds: 5,
    })
    expect(remaining(ENDS_AT, ENDS_AT - 1)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 1 })
    expect(remaining(ENDS_AT, ENDS_AT - 1500)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 2 })
    expect(remaining(ENDS_AT, ENDS_AT - 120 * DAY)).toEqual({ days: 120, hours: 0, minutes: 0, seconds: 0 })
  })

  it("has nothing left at the end, after it, and for an unreadable moment", () => {
    expect(remaining(ENDS_AT, ENDS_AT)).toBeNull()
    expect(remaining(ENDS_AT, ENDS_AT + 1)).toBeNull()
    expect(remaining(Number.NaN, ENDS_AT)).toBeNull()
  })

  it("ticks next when the whole seconds left change", () => {
    expect(untilNextTick(ENDS_AT, ENDS_AT - 2500)).toBe(500)
    expect(untilNextTick(ENDS_AT, ENDS_AT - 2000)).toBe(1000)
    expect(untilNextTick(ENDS_AT, ENDS_AT - 1)).toBe(1)
    const now = ENDS_AT - 2500
    expect(remaining(ENDS_AT, now + untilNextTick(ENDS_AT, now))!.seconds).toBe(remaining(ENDS_AT, now)!.seconds - 1)
  })

  it("writes the end in the template's own offset, whoever reads it", () => {
    expect(offsetLabel(180)).toBe("UTC+3")
    expect(offsetLabel(-330)).toBe("UTC−5:30")
    expect(offsetLabel(0)).toBe("UTC")
    expect(formatDeadline(ENDS_AT, 180, "ru")).toBe("30 ноября в 23:59 (UTC+3)")
    expect(formatDeadline(ENDS_AT, 0, "en")).toMatch(/^November 30.* 20:59 \(UTC\)$/)
    expect(pad(5)).toBe("05")
    expect(pad(120)).toBe("120")
  })
})

describe("countdown/timer props", () => {
  it("is registered once, in its category, as a lab home block with the brief's roles", () => {
    expect(blockById("countdown/timer")).toBe(timer)
    expect(BLOCKS.filter((entry) => entry.id === "countdown/timer")).toHaveLength(1)
    expect(CATEGORY_BLOCKS.countdown).toContain(timer)
    expect(timer).toMatchObject({ status: "lab", placement: "home", data: ["static"] })
    expect(timer.roles).toEqual(["heading", "countdown", "description", "cta-primary"])
  })

  it("accepts both fixtures and absent props, with the block's own words as defaults", () => {
    expect(parseCountdownTimerProps(timer.fixtures!.sample)).toEqual({ ok: true, value: timer.fixtures!.sample })
    expect(parseCountdownTimerProps(timer.fixtures!.empty)).toEqual({ ok: true, value: timer.fixtures!.empty })
    const bare = parseCountdownTimerProps(undefined)
    expect(bare.ok && bare.value).toMatchObject({
      endsAt: null,
      afterEnd: "hide",
      style: "block",
      button: null,
      daysLabel: { ru: "дни", en: "days" },
      deadlineLabel: DEADLINE_LABEL,
    })
    const ended = parseCountdownTimerProps({ endsAt: ENDS, afterEnd: {} })
    expect(ended.ok && ended.value.afterEnd).toEqual({ message: ENDED_MESSAGE })
  })

  it("refuses an end without an offset, a strange afterEnd and a deadline line without {date}, by path", () => {
    const result = parseCountdownTimerProps({
      endsAt: "2026-11-30T23:59:00",
      afterEnd: "show",
      style: "bar",
      deadlineLabel: { ru: "Акция скоро кончится" },
      hoursLabel: { ru: "часы и ещё немного больше, чем нужно" },
      button: { label: { ru: "Купить" } },
      colour: "red",
    })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^endsAt must be an ISO date and time with its offset/),
        'afterEnd must be "hide" or { message }',
        "style must be one of: inline, block",
        "deadlineLabel.ru must contain {date}",
        expect.stringMatching(/^hoursLabel\.ru is \d+ characters, at most 20/),
        "button.href is required",
        "colour: not a prop of countdown/timer",
      ])
    )
  })
})

describe("countdown/timer render", () => {
  it("draws the heading, the line, the clock at the server's moment, the deadline and the button", async () => {
    at(ENDS_AT - (48 * DAY + 5 * HOUR + 7 * MINUTE + 9 * SECOND))
    const html = (await render(sample))!
    expect(html).toContain('data-block="countdown/timer"')
    expect(html).toContain(`<h2 data-role="heading" class="${SECTION_TYPE.heading}">Чёрная пятница: чугун на 30\u00a0% дешевле</h2>`)
    expect(html).toMatch(/<p data-role="description" class="[^"]*text-ui-fg-subtle[^"]*">Сотейники/)
    expect(html).toContain('role="timer" aria-live="off" data-role="countdown"')
    const numbers = Array.from(
      html.matchAll(/<span class="[^"]*tabular-nums[^"]*">(\d+)<\/span><span class="[^"]*">([^<]+)<\/span>/g),
      ([, value, unit]) => `${value} ${unit}`
    )
    expect(numbers).toEqual(["48 дни", "05 часы", "07 минуты", "09 секунды"])
    expect(html).toContain('Акция до <time dateTime="2026-11-30T23:59:00+03:00">30 ноября в 23:59 (UTC+3)</time>')
    expect(html).toMatch(/<a href="\/ru\/categories\/cookware" data-role="cta-primary" class="[^"]*min-h-11[^"]*">Смотреть посуду<\/a>/)
    expect(html).not.toContain("<h1")
  })

  it("speaks the visitor's language, in the words and in the date", async () => {
    state.locale = "en"
    at(ENDS_AT - 3 * DAY)
    const html = (await render(sample))!
    expect(html).toContain(">days</span>")
    expect(html).toMatch(/Offer ends <time dateTime="[^"]+">November 30[^<]*23:59 \(UTC\+3\)<\/time>/)
  })

  it("draws nothing for a past, a missing or an unreadable end when afterEnd is hide", async () => {
    at(ENDS_AT)
    expect(await render({ ...sample, afterEnd: "hide" })).toBeNull()
    expect(await render({ ...sample, afterEnd: "hide", endsAt: null })).toBeNull()
    expect(await render({ ...sample, afterEnd: "hide", endsAt: "2026-11-30 23:59" })).toBeNull()
    expect(await render(timer.fixtures!.empty)).toBeNull()
  })

  it("puts the message where the clock was after the end, and keeps the words and the button", async () => {
    at(ENDS_AT + 1)
    const html = (await render(sample))!
    expect(html).toContain('<p data-role="countdown" class="')
    expect(html).toContain(">Чёрная пятница закончилась. Спасибо, что были с нами</p>")
    expect(html).not.toContain('role="timer"')
    expect(html).not.toContain("<time")
    expect(html).toContain('data-role="heading"')
    expect(html).toContain('data-role="cta-primary"')
  })

  it("ends at the second the clock would read zero, not a second later", async () => {
    at(ENDS_AT - 1)
    expect(await render({ ...sample, afterEnd: "hide" })).toContain('role="timer"')
    at(ENDS_AT)
    expect(await render({ ...sample, afterEnd: "hide" })).toBeNull()
  })

  it("draws a block as large cells on the card surface, centred", async () => {
    at(ENDS_AT - DAY)
    const html = (await render(sample))!
    expect(html).toContain("text-center")
    expect(html.match(/border-\[var\(--border\)\] bg-\[var\(--card\)\]/g)).toHaveLength(4)
    expect(html).toContain("text-4xl")
    expect(html).toContain("small:text-5xl")
  })

  it("draws inline as one bar on the card surface, side by side from 1024 px", async () => {
    at(ENDS_AT - DAY)
    const html = (await render({ ...sample, style: "inline" }))!
    expect(html.match(/bg-\[var\(--card\)\]/g)).toHaveLength(1)
    expect(html).toMatch(/class="[^"]*rounded-\[var\(--radius\)\][^"]*bg-\[var\(--card\)\][^"]*small:flex-row[^"]*"/)
    expect(html).toContain("text-2xl")
    expect(html).not.toContain("text-center")
  })

  it("takes only tokens: no fixed colours, no own outer spacing", async () => {
    at(ENDS_AT - DAY)
    for (const style of ["block", "inline"] as const) {
      const html = (await render({ ...sample, style }))!
      expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|oklch\(|bg-(white|black)\b|text-(white|black)\b/i)
      expect(html.match(/<section[^>]*>/)![0]).toBe(
        '<section data-block="countdown/timer" class="py-[calc(var(--layer-section-gap,3rem)/2)]">'
      )
    }
  })
})
