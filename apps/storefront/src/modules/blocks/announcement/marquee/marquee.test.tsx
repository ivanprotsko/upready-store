import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { CATEGORY_BLOCKS, blockById } from "../../registry"
import Marquee from "."
import { marquee } from "./block"
import styles from "./marquee.module.css"
import {
  FILL_WIDTH,
  REGION_LABEL,
  marqueeLoop,
  parseMarqueeProps,
  type MarqueeItem,
  type MarqueeProps,
} from "./props"

vi.mock("server-only", () => ({}))

const locale = vi.hoisted(() => ({ current: "ru" }))
vi.mock("next-intl/server", () => ({ getLocale: async () => locale.current }))
vi.mock("@i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={`/ru${href}`} {...rest}>
      {children}
    </a>
  ),
}))

const render = async (props: MarqueeProps) => {
  const tree = await Marquee(props)
  return tree === null ? null : renderToStaticMarkup(tree)
}

const item = (ru: string, rest: Partial<MarqueeItem> = {}): MarqueeItem => ({
  text: { ru },
  icon: null,
  href: null,
  ...rest,
})

const props = (items: MarqueeItem[], rest: Partial<MarqueeProps> = {}): MarqueeProps => ({
  items,
  speed: "normal",
  direction: "left",
  separator: "dot",
  tone: "plain",
  label: REGION_LABEL,
  ...rest,
})

/** The markup of the readable copy and of the second, hidden one. */
const copies = (html: string) => {
  const lists = html.match(/<ul[\s\S]*?<\/ul>/g) ?? []
  return { first: lists[0] ?? "", second: lists[1] ?? "", count: lists.length }
}

const count = (html: string, pattern: RegExp) => html.match(pattern)?.length ?? 0

beforeEach(() => {
  locale.current = "ru"
})

describe("parseMarqueeProps", () => {
  it("fills speed, direction, separator, tone and the label when only the items are given", () => {
    expect(parseMarqueeProps({ items: [{ text: { ru: "Раз" } }] })).toEqual({
      ok: true,
      value: props([item("Раз")]),
    })
  })

  it("takes one to eight items, each with an optional icon of the list and an optional href", () => {
    const eight = Array.from({ length: 8 }, (_, i) => ({ text: { ru: `П${i}` }, icon: "truck", href: "/store" }))
    expect(parseMarqueeProps({ items: eight }).ok).toBe(true)
    expect(parseMarqueeProps({ items: [] })).toEqual({ ok: false, errors: ["items has 0 items, at least 1"] })
    expect(parseMarqueeProps({ items: [...eight, eight[0]] })).toEqual({
      ok: false,
      errors: ["items has 9 items, at most 8"],
    })
    expect(parseMarqueeProps({})).toEqual({ ok: false, errors: ["items is required"] })
  })

  it("refuses an icon off the list, an href to another site, a long text and an unknown setting", () => {
    const result = parseMarqueeProps({
      items: [{ text: { ru: "х".repeat(91) }, icon: "rocket", href: "//evil.example" }],
      speed: "fast",
      direction: "up",
      separator: "arrow",
      tone: "neon",
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toEqual([
      "items[0].text.ru is 91 characters, at most 90",
      "items[0].icon must be an icon of shared/icon-name.ts, e.g. truck, credit-card, shield-check",
      "items[0].href: // leads to another site; write https://",
      "speed must be one of: slow, normal",
      "direction must be one of: left, right",
      "separator must be one of: dot, star, icon",
      "tone must be one of: plain, inverted, accent",
    ])
  })
})

describe("marqueeLoop", () => {
  it("repeats short points until one copy fills the widest screen, and a long line once", () => {
    const short = marqueeLoop([{ text: "Доставка", icon: null, href: null }], "dot", "normal")
    expect(short.sets).toBeGreaterThan(1)
    expect(short.sets * (8 * 7.7 + 60)).toBeGreaterThanOrEqual(FILL_WIDTH)
    const long = marqueeLoop(
      Array.from({ length: 8 }, () => ({ text: "х".repeat(90), icon: null, href: null })),
      "dot",
      "normal"
    )
    expect(long.sets).toBe(1)
  })

  it("keeps the speed in pixels a second: slow takes twice as long, a longer line takes longer", () => {
    const lines = [{ text: "Бесплатная доставка от 3000 ₽", icon: null, href: null }]
    const normal = marqueeLoop(lines, "dot", "normal")
    const slow = marqueeLoop(lines, "dot", "slow")
    expect(slow.seconds).toBeGreaterThanOrEqual(normal.seconds * 2 - 1)
    expect(slow.seconds).toBeLessThanOrEqual(normal.seconds * 2 + 1)
    const longer = Array.from({ length: 8 }, () => ({ text: "х".repeat(90), icon: null, href: null }))
    expect(marqueeLoop(longer, "dot", "normal").seconds).toBeGreaterThan(normal.seconds)
  })
})

describe("Marquee", () => {
  it("draws nothing without a point in any language, so the empty fixture is null", async () => {
    expect(await render(props([item(""), { text: {}, icon: null, href: null }]))).toBeNull()
    const empty = parseMarqueeProps(marquee.fixtures!.empty)
    expect(empty.ok).toBe(true)
    if (empty.ok) expect(await render(empty.value)).toBeNull()
  })

  it("picks the visitor's language, then English, and drops a point with nothing to say", async () => {
    locale.current = "de"
    const html = (await render(
      props([{ text: { ru: "Раз", en: "One" }, icon: null, href: null }, { text: {}, icon: null, href: null }])
    ))!
    const { first } = copies(html)
    expect(first).toContain(">One<")
    expect(first).not.toContain("Раз")
  })

  it("runs two equal copies; the second and every repeat are aria-hidden and inert", async () => {
    const html = (await render(props([item("Раз"), item("Два", { href: "/store" })])))!
    const { first, second, count: lists } = copies(html)
    expect(lists).toBe(2)
    expect(second).toMatch(/^<ul aria-hidden="true" inert=""/)
    expect(count(first, /<li/g)).toBe(count(second, /<li/g))
    // The readable copy says each point once; its repeats are hidden from a reader and the Tab key.
    expect(count(first, /<li class/g)).toBe(2)
    expect(count(first, /<li aria-hidden="true" inert=""/g)).toBe(count(first, /<li/g) - 2)
    expect(count(first, /<a [^>]*tabindex="-1"/g)).toBe(count(first, /<a /g) - 1)
  })

  it("is a server component: CSS runs the loop, the lap's duration is set inline, no client code", async () => {
    const html = (await render(props([item("Раз")])))!
    const { seconds } = marqueeLoop([{ text: "Раз", icon: null, href: null }], "dot", "normal")
    expect(html).toContain(`style="--marquee-duration:${seconds}s"`)
    expect(html).toContain('data-role="marquee"')
    const source = readFileSync(fileURLToPath(new URL("./index.tsx", import.meta.url)), "utf8")
    expect(source).not.toMatch(/^"use client"/)
    expect(source).not.toMatch(/setInterval|setTimeout|requestAnimationFrame|useEffect/)
  })

  it("moves the other way for direction right", async () => {
    const left = (await render(props([item("Раз")])))!
    const right = (await render(props([item("Раз")], { direction: "right" })))!
    const track = (html: string) => html.match(/<div data-role="marquee" class="([^"]*)"/)?.[1] ?? ""
    expect(track(left).split(" ")).not.toContain(styles.right)
    expect(track(right).split(" ")).toContain(styles.right)
  })

  it("paints each tone with the theme's own pair", async () => {
    const tones = {
      plain: "bg-[var(--muted)] text-[var(--foreground)]",
      inverted: "bg-[var(--foreground)] text-[var(--background)]",
      accent: "bg-[var(--primary)] text-[var(--primary-foreground)]",
    } as const
    for (const [tone, classes] of Object.entries(tones)) {
      const html = (await render(props([item("Раз")], { tone: tone as MarqueeProps["tone"] })))!
      expect(html).toContain(classes)
    }
  })

  it("marks the points with a dot, a star, or each point's own icon with a dot where it has none", async () => {
    const items = [item("Раз", { icon: "gift" }), item("Два")]
    const first = async (separator: MarqueeProps["separator"]) =>
      copies((await render(props(items, { separator })))!).first
    const dot = await first("dot")
    expect(count(dot, /rounded-full bg-current/g)).toBeGreaterThanOrEqual(2)
    expect(dot).toContain("lucide-gift")
    const star = await first("star")
    expect(count(star, /lucide-star/g)).toBeGreaterThanOrEqual(2)
    expect(star).not.toContain("rounded-full bg-current")
    const icon = await first("icon")
    // «Раз» leads with its gift and draws it once, as the mark; «Два» has no icon and gets a dot.
    const [one, two] = icon.split("</li>")
    expect(count(one, /lucide-gift/g)).toBe(1)
    expect(one).not.toContain("rounded-full")
    expect(two).toContain("rounded-full bg-current")
  })

  it("names the roles: a bonus note by its gift or percent icon, a link as nav-link, the rest as description", async () => {
    const html = (await render(
      props([
        item("Бонусы", { icon: "gift" }),
        item("Скидка", { icon: "percent" }),
        item("Доставка", { icon: "truck", href: "/store" }),
        item("Возврат", { href: "https://example.com/return" }),
      ])
    ))!
    const { first } = copies(html)
    expect(first).toMatch(/data-role="bonus-badge"[^>]*>Бонусы</)
    expect(first).toMatch(/data-role="bonus-badge"[^>]*>Скидка</)
    expect(first).toMatch(/data-role="description"[^>]*><a href="\/ru\/store" data-role="nav-link"[^>]*>Доставка</)
    expect(first).toMatch(/<a href="https:\/\/example.com\/return" data-role="nav-link"[^>]*>Возврат</)
  })

  it("holds still under reduced motion: the CSS stops the loop, hides the copies, and the points wrap", async () => {
    const css = readFileSync(fileURLToPath(new URL("./marquee.module.css", import.meta.url)), "utf8")
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"))
    expect(reduced).toMatch(/\.track\s*{[^}]*animation:\s*none/)
    expect(reduced).toMatch(/\.echo\s*{[^}]*display:\s*none/)
    expect(css).toMatch(/\.bar:hover \.track,\s*\.bar:focus-within \.track\s*{[^}]*animation-play-state:\s*paused/)
    // Keyboard focus brings the track back to its start, so the focused link stands where it can be scrolled to.
    expect(css).toMatch(/\.bar:has\(:focus-visible\) \.track\s*{[^}]*animation:\s*none/)
    // Two classes: the `flex` utility on the copies must not win their hiding back.
    expect(reduced).toMatch(/\.track \.echo\s*{[^}]*display:\s*none/)
    expect(css).toMatch(/@keyframes run\s*{[^@]*transform: translateX\(0\)[^@]*transform: translateX\(-50%\)/)
    const html = (await render(props([item("Раз"), item("Два")])))!
    expect(copies(html).first).toMatch(/^<ul class="[^"]*motion-reduce:flex-wrap/)
    expect(html).toContain("motion-reduce:whitespace-normal")
  })

  it("names the line for a screen reader from its label", async () => {
    const html = (await render(props([item("Раз")])))!
    expect(html).toMatch(/^<section data-block="announcement\/marquee" aria-label="Предложения магазина"/)
  })
})

describe("the registry entry", () => {
  it("is announcement/marquee, a lab home block of static data with its four roles", () => {
    expect(blockById("announcement/marquee")).toBe(marquee)
    expect(CATEGORY_BLOCKS.announcement.map((b) => b.id)).toContain("announcement/marquee")
    expect(marquee).toMatchObject({
      status: "lab",
      placement: "home",
      data: ["static"],
      roles: ["bonus-badge", "description", "marquee", "nav-link"],
    })
    expect(parseMarqueeProps(marquee.fixtures!.sample).ok).toBe(true)
  })
})
