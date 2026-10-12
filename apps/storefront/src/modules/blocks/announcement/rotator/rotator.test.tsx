import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { BLOCKS, CATEGORY_BLOCKS, blockById } from "../../registry"
import Rotator from "."
import { rotator } from "./block"
import {
  CLOSE_LABEL,
  NEXT_LABEL,
  PREVIOUS_LABEL,
  REGION_LABEL,
  dismissKey,
  parseRotatorProps,
  type RotatorProps,
} from "./props"

vi.mock("server-only", () => ({}))

const locale = vi.hoisted(() => ({ current: "ru" }))
vi.mock("next-intl/server", () => ({ getLocale: async () => locale.current }))
vi.mock("@i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: ReactNode
  }) => (
    <a href={`/ru${href}`} {...rest}>
      {children}
    </a>
  ),
}))

const render = async (props: RotatorProps) => {
  const tree = await Rotator(props)
  return tree === null ? null : renderToStaticMarkup(tree)
}

const chrome = {
  label: REGION_LABEL,
  previousLabel: PREVIOUS_LABEL,
  nextLabel: NEXT_LABEL,
  closeLabel: CLOSE_LABEL,
}

const props = (
  messages: RotatorProps["messages"],
  rest: Partial<RotatorProps> = {}
): RotatorProps => ({
  messages,
  interval: 5,
  dismissible: false,
  ...chrome,
  ...rest,
})

const count = (html: string, pattern: RegExp) =>
  html.match(pattern)?.length ?? 0

beforeEach(() => {
  locale.current = "ru"
})

describe("parseRotatorProps", () => {
  it("fills interval, dismissible and the bar's own words when only the messages are given", () => {
    const messages = [
      { text: { ru: "Раз" } },
      { text: { ru: "Два" }, href: "/store" },
    ]
    expect(parseRotatorProps({ messages })).toEqual({
      ok: true,
      value: props([
        { text: { ru: "Раз" }, href: null },
        { text: { ru: "Два" }, href: "/store" },
      ]),
    })
    for (const words of [
      REGION_LABEL,
      PREVIOUS_LABEL,
      NEXT_LABEL,
      CLOSE_LABEL,
    ]) {
      expect(words.ru && words.en).toBeTruthy()
    }
  })

  it("asks for two to five messages", () => {
    const one = parseRotatorProps({ messages: [{ text: { ru: "Раз" } }] })
    const six = parseRotatorProps({
      messages: Array.from({ length: 6 }, () => ({ text: { ru: "Да" } })),
    })
    expect(one.ok ? [] : one.errors).toEqual([
      "messages has 1 items, at least 2",
    ])
    expect(six.ok ? [] : six.errors).toEqual([
      "messages has 6 items, at most 5",
    ])
    expect(parseRotatorProps(undefined)).toEqual({
      ok: false,
      errors: ["messages is required"],
    })
  })

  it("refuses bad props with the path of every field", () => {
    const result = parseRotatorProps({
      messages: [
        { text: { ru: "я".repeat(141) } },
        { text: { xx: "Hi" }, href: "//evil.example" },
        "plain",
      ],
      interval: 3,
      dismissible: "yes",
      closeLabel: { ru: "з".repeat(61) },
      speed: 2,
    })
    expect(result.ok ? [] : result.errors).toEqual([
      "messages[0].text.ru is 141 characters, at most 140",
      "messages[1].text.xx: not a language of i18n/config.ts",
      "messages[1].href: // leads to another site; write https://",
      "messages[2] must be an object { text, href }",
      "interval must be a whole number from 4 to 10",
      "dismissible must be true or false",
      "closeLabel.ru is 61 characters, at most 60",
      "speed: not a prop of announcement/rotator",
    ])
  })

  it("takes an interval of 4 and of 10 seconds, not 11", () => {
    const messages = [{ text: { ru: "Раз" } }, { text: { ru: "Два" } }]
    expect(parseRotatorProps({ messages, interval: 4 }).ok).toBe(true)
    expect(parseRotatorProps({ messages, interval: 10 }).ok).toBe(true)
    expect(parseRotatorProps({ messages, interval: 11 }).ok).toBe(false)
  })
})

describe("dismissKey", () => {
  const messages = props([
    { text: { ru: "Раз", en: "One" }, href: null },
    { text: { ru: "Два", en: "Two" }, href: "/store" },
  ]).messages

  it("is the same for the same messages, so a closed bar stays closed for the session", () => {
    expect(dismissKey(messages)).toBe(dismissKey(structuredClone(messages)))
    expect(dismissKey(messages)).toMatch(/^announcement-rotator:[0-9a-z]+$/)
  })

  it("changes with any word or link of any message, so new messages show again", () => {
    const key = dismissKey(messages)
    expect(
      dismissKey([messages[0], { ...messages[1], href: "/sale" }])
    ).not.toBe(key)
    expect(
      dismissKey([
        { ...messages[0], text: { ru: "Раз", en: "Uno" } },
        messages[1],
      ])
    ).not.toBe(key)
    expect(dismissKey([messages[1], messages[0]])).not.toBe(key)
  })
})

describe("Rotator", () => {
  it("draws nothing when no message has words in any language", async () => {
    expect(await render(rotator.fixtures!.empty)).toBeNull()
    expect(
      await render(
        props([
          { text: { ru: "   " }, href: "/store" },
          { text: {}, href: null },
        ])
      )
    ).toBeNull()
  })

  it("draws every message in one cell, the first one shown, with arrows on both sides", async () => {
    const html = (await render(rotator.fixtures!.sample))!
    expect(html).toContain('data-block="announcement/rotator"')
    expect(html).toContain('aria-label="Объявления магазина"')
    expect(count(html, /data-role="description"/g)).toBe(3)
    expect(count(html, /aria-hidden="false"/g)).toBe(1)
    expect(html).toMatch(
      /aria-hidden="false"[^>]*><a [^>]*>Доставка по городу за два часа</
    )
    expect(html).toContain('<a href="/ru/store" data-role="nav-link"')
    expect(count(html, /data-role="trigger"/g)).toBe(2)
    expect(html).toContain('aria-label="Предыдущее объявление"')
    expect(html).toContain('aria-label="Следующее объявление"')
    expect(html).toContain('data-role="close-button"')
    expect(html).toContain('aria-label="Закрыть объявления"')
  })

  it("renders on the server without a timer and with a polite live region", async () => {
    // The server snapshot of prefers-reduced-motion is «reduced»: nothing moves before hydration.
    const html = (await render(rotator.fixtures!.sample))!
    expect(html).toContain('aria-live="polite"')
  })

  it("drops a message with nothing to say and draws one left as a still bar, no arrows", async () => {
    const html = (await render(
      props([
        { text: { ru: "Самовывоз бесплатно" }, href: null },
        { text: {}, href: "/store" },
      ])
    ))!
    expect(count(html, /data-role="description"/g)).toBe(1)
    expect(html).toContain("Самовывоз бесплатно")
    expect(html).not.toContain('data-role="trigger"')
    expect(html).not.toContain('data-role="close-button"')
  })

  it("keeps the close button on a single message when the owner made the bar dismissible", async () => {
    const html = (await render(
      props(
        [
          { text: { ru: "Самовывоз бесплатно" }, href: null },
          { text: {}, href: null },
        ],
        { dismissible: true }
      )
    ))!
    expect(html).not.toContain('data-role="trigger"')
    expect(count(html, /data-role="close-button"/g)).toBe(1)
  })

  it("speaks the visitor's language, else English, and its own chrome falls back to its defaults", async () => {
    locale.current = "de"
    const html = (await render(
      props(
        [
          { text: { ru: "Только по-русски", en: "English line" }, href: null },
          {
            text: { de: "Deutsche Zeile", en: "Second" },
            href: "https://example.com/de",
          },
        ],
        { closeLabel: {}, dismissible: true }
      )
    ))!
    expect(html).toContain("English line")
    expect(html).toContain("Deutsche Zeile")
    expect(html).toContain(
      '<a href="https://example.com/de" data-role="nav-link"'
    )
    expect(html).toContain('aria-label="Close announcements"')
  })

  it("uses theme tokens only", async () => {
    const html = (await render(rotator.fixtures!.sample))!
    expect(html).toContain("bg-[var(--primary)]")
    expect(html).toContain("text-[var(--primary-foreground)]")
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i)
  })
})

describe("the registry entry", () => {
  it("stands in the announcement category before text-bar, a lab home block of static data", () => {
    expect(blockById("announcement/rotator")).toBe(rotator)
    expect(BLOCKS).toContain(rotator)
    expect(CATEGORY_BLOCKS.announcement.map((entry) => entry.variant)).toEqual([
      "rotator",
      "text-bar",
    ])
    expect(rotator).toMatchObject({
      status: "lab",
      placement: "home",
      data: ["static"],
    })
    expect(rotator.roles).toEqual([
      "close-button",
      "description",
      "nav-link",
      "trigger",
    ])
  })

  it("has fixtures its own parser accepts", () => {
    expect(parseRotatorProps(rotator.fixtures!.empty)).toEqual({
      ok: true,
      value: rotator.fixtures!.empty,
    })
    expect(parseRotatorProps(rotator.fixtures!.sample)).toEqual({
      ok: true,
      value: rotator.fixtures!.sample,
    })
  })
})
