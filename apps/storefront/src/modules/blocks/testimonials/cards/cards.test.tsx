import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getTemplate } from "@lib/templates/catalog"
import { validateTemplate } from "@lib/templates/manifest"

import { BLOCKS, CATEGORY_BLOCKS, blockById } from "../../registry"
import TestimonialsCards from "."
import { testimonialsCards } from "./block"
import {
  LIST_LABEL,
  NEXT_LABEL,
  PREVIOUS_LABEL,
  RATING_LABEL,
  parseTestimonialsCardsProps,
  type Testimonial,
  type TestimonialsCardsProps,
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

const render = async (props: TestimonialsCardsProps) => {
  const tree = await TestimonialsCards(props)
  return tree === null ? null : renderToStaticMarkup(tree)
}

const labels = { ratingLabel: RATING_LABEL, listLabel: LIST_LABEL, previousLabel: PREVIOUS_LABEL, nextLabel: NEXT_LABEL }
const blank: TestimonialsCardsProps = { header: null, items: [], layout: "grid", showRating: true, ...labels }

const item = (quote: string, rating: number | null = 5, name = "Марина", city = "Казань"): Testimonial => ({
  quote: { ru: quote },
  name: { ru: name },
  city: city ? { ru: city } : {},
  rating,
})
const two = [item("Привезли за два дня, всё целое."), item("Ответили в чате за десять минут.", 4, "Тимур", "Пермь")]

beforeEach(() => {
  locale.current = "ru"
})

describe("parseTestimonialsCardsProps", () => {
  it("reads absent props as an empty grid with stars and the block's own Russian and English labels", () => {
    expect(parseTestimonialsCardsProps(undefined)).toEqual({ ok: true, value: blank })
    for (const text of [RATING_LABEL, LIST_LABEL, PREVIOUS_LABEL, NEXT_LABEL]) {
      expect(text.ru && text.en).toBeTruthy()
    }
    expect(RATING_LABEL.ru).toContain("{rating}")
    expect(RATING_LABEL.en).toContain("{rating}")
  })

  it("reads an item without a city or a rating as no city and no stars", () => {
    const result = parseTestimonialsCardsProps({
      items: [
        { quote: { ru: "Отлично" }, name: { ru: "Вера" } },
        { quote: { ru: "Хорошо" }, name: { ru: "Олег" }, city: { ru: "Тверь" }, rating: 3 },
      ],
    })
    expect(result.ok && result.value.items).toEqual([
      { quote: { ru: "Отлично" }, name: { ru: "Вера" }, city: {}, rating: null },
      { quote: { ru: "Хорошо" }, name: { ru: "Олег" }, city: { ru: "Тверь" }, rating: 3 },
    ])
  })

  it("takes none or two to nine items, never one and never ten", () => {
    const items = (n: number) => Array.from({ length: n }, () => ({ quote: { ru: "Отзыв" }, name: { ru: "Вера" } }))
    expect(parseTestimonialsCardsProps({ items: [] }).ok).toBe(true)
    expect(parseTestimonialsCardsProps({ items: items(2) }).ok).toBe(true)
    expect(parseTestimonialsCardsProps({ items: items(9) }).ok).toBe(true)
    const one = parseTestimonialsCardsProps({ items: items(1) })
    expect(one.ok ? [] : one.errors).toEqual(["items has 1 item, at least 2 (or none for an empty section)"])
    const ten = parseTestimonialsCardsProps({ items: items(10) })
    expect(ten.ok ? [] : ten.errors).toEqual(["items has 10 items, at most 9"])
  })

  it("refuses bad props with the path of every field", () => {
    const result = parseTestimonialsCardsProps({
      items: [
        { quote: { ru: "я".repeat(401) }, name: { ru: "Вера" }, rating: 6 },
        { name: { xx: "Olga" }, rating: 2.5 },
      ],
      layout: "slider",
      showRating: "yes",
      ratingLabel: { ru: "Пять звёзд" },
      header: { heading: { ru: "Отзывы" }, seeAll: { href: "//evil.example" } },
      reviews: [],
    })
    expect(result.ok ? [] : result.errors).toEqual([
      "header.seeAll.href: // leads to another site; write https://",
      "items[0].quote.ru is 401 characters, at most 400",
      "items[0].rating must be a whole number from 1 to 5",
      "items[1].quote must be an object of language code to string",
      "items[1].name.xx: not a language of i18n/config.ts",
      "items[1].rating must be a whole number from 1 to 5",
      "layout must be one of: grid, carousel",
      "showRating must be true or false",
      "ratingLabel.ru must contain {rating}",
      "reviews: not a prop of testimonials/cards",
    ])
  })
})

describe("TestimonialsCards", () => {
  it("draws nothing without a quote, names and header or not", async () => {
    expect(await render(blank)).toBeNull()
    expect(await render(testimonialsCards.fixtures!.empty)).toBeNull()
    expect(
      await render({
        ...blank,
        header: { eyebrow: {}, heading: { ru: "Отзывы" }, description: {}, seeAll: null },
        items: [item("  "), { ...item(""), quote: {} }],
      })
    ).toBeNull()
  })

  it("falls back to English, then any language, as pickText does", async () => {
    locale.current = "de"
    const html = (await render({ ...blank, items: [{ ...item(""), quote: { fr: "Livraison rapide" } }, two[1]] }))!
    expect(html).toContain("Livraison rapide")
  })

  it("draws every card as a figure: stars, the quote as a blockquote, then the name and the city", async () => {
    const html = (await render({ ...blank, items: two }))!
    expect(html).toMatch(/^<section data-block="testimonials\/cards"/)
    const cards = html.match(/<figure data-role="testimonial-card"[^>]*>.*?<\/figure>/g) ?? []
    expect(cards).toHaveLength(2)
    expect(cards[0]).toMatch(
      /<div data-role="star-rating" role="img" aria-label="Оценка 5 из 5"[^>]*>.*<\/div><blockquote data-role="quote-text"[^>]*>Привезли за два дня, всё целое\.<\/blockquote><figcaption data-role="author-info"[^>]*><span[^>]*>Марина<\/span><span[^>]*>Казань<\/span><\/figcaption>/
    )
    expect(cards[1]).toContain('aria-label="Оценка 4 из 5"')
  })

  it("fills as many stars as the rating with --primary and leaves the rest empty", async () => {
    const html = (await render({ ...blank, items: [item("Хорошо", 4), item("Отлично", 1)] }))!
    const groups = html.match(/<div data-role="star-rating".*?<\/div>/g) ?? []
    expect(groups).toHaveLength(2)
    const [four, one] = groups as [string, string]
    const count = (group: string, cls: string) => group.split("<svg").slice(1).filter((svg) => svg.includes(cls)).length
    expect(count(four, "fill-[var(--primary)]")).toBe(4)
    expect(count(four, "fill-none")).toBe(1)
    expect(count(one, "fill-[var(--primary)]")).toBe(1)
    expect(groups.every((g) => (g.match(/<svg/g) ?? []).length === 5)).toBe(true)
    expect(groups.every((g) => (g.match(/aria-hidden="true"/g) ?? []).length === 5)).toBe(true)
  })

  it("draws no stars when showRating is off or the item has no rating, and no caption without a name or city", async () => {
    const off = (await render({ ...blank, showRating: false, items: two }))!
    expect(off).not.toContain('data-role="star-rating"')
    const none = (await render({ ...blank, items: [item("Без оценки", null, "", ""), two[0]] }))!
    expect(none.match(/data-role="star-rating"/g)).toHaveLength(1)
    expect(none.match(/data-role="author-info"/g)).toHaveLength(1)
  })

  it("reads the stars in the shop's own words and in English", async () => {
    const own = (await render({ ...blank, items: two, ratingLabel: { ru: "{rating} звезды из пяти" } }))!
    expect(own).toContain('aria-label="5 звезды из пяти"')
    locale.current = "en"
    expect(await render({ ...blank, items: two })).toContain('aria-label="Rated 5 out of 5"')
  })

  it("keeps the quote plain: markup in the props is shown, not run", async () => {
    const html = (await render({ ...blank, items: [item('<b>жирный</b> <script>alert(1)</script>'), two[1]] }))!
    expect(html).not.toContain("<b>")
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;b&gt;жирный&lt;/b&gt;")
  })

  it("lays a grid out 1, 2, 3 across, and two or four cards 2 across, tokens only", async () => {
    const three = (await render({ ...blank, items: [...two, item("Третий")] }))!
    expect(three).toMatch(/<ul class="grid grid-cols-1 gap-4 xsmall:grid-cols-2 small:gap-6 small:grid-cols-3">/)
    for (const items of [two, [...two, ...two]]) {
      const html = (await render({ ...blank, items }))!
      expect(html).toContain("xsmall:grid-cols-2")
      expect(html).not.toContain("small:grid-cols-3")
    }
    expect(three).toContain("rounded-[var(--radius)]")
    expect(three).toContain("bg-[var(--card)]")
    expect(three).toContain("border-[var(--border)]")
    expect(three).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|oklch\(|shadow-\[/i)
    expect(three).not.toContain("snap-x")
  })

  it("draws the carousel as one snapping row with a label and two buttons", async () => {
    const html = (await render({ ...testimonialsCards.fixtures!.sample }))!
    expect(html).toMatch(/<ul tabindex="0" aria-label="Отзывы покупателей" style="[^"]*" class="flex snap-x snap-mandatory/)
    expect(html).toContain("mask-image:linear-gradient(to right, black, black calc(100% - 2rem), transparent)")
    const items = html.match(/<li class="[^"]*snap-start[^"]*">/g) ?? []
    expect(items).toHaveLength(testimonialsCards.fixtures!.sample.items.length)
    expect(html).toMatch(/<button type="button" data-role="trigger" aria-label="Предыдущие отзывы" disabled=""/)
    expect(html).toMatch(/<button type="button" data-role="trigger" aria-label="Следующие отзывы"/)
    expect(html).toContain("size-11")
    expect(html).toMatch(/<h2 data-role="heading"[^>]*>Что говорят покупатели<\/h2>/)
  })
})

describe("testimonials/cards in the registry", () => {
  it("is a static lab home block with the roles it draws, after the collection blocks", () => {
    expect(blockById("testimonials/cards")).toBe(testimonialsCards)
    expect(testimonialsCards).toMatchObject({
      category: "testimonials",
      variant: "cards",
      data: ["static"],
      status: "lab",
      placement: "home",
    })
    expect([...testimonialsCards.roles].sort()).toEqual(
      ["author-info", "quote-text", "section-header", "star-rating", "testimonial-card", "trigger"].sort()
    )
    expect(CATEGORY_BLOCKS.testimonials.map((b) => b.id)).toContain("testimonials/cards")
    const ids = BLOCKS.map((b) => b.id)
    const lastText = Math.max(...CATEGORY_BLOCKS.text.map((b) => ids.indexOf(b.id)))
    expect(ids.indexOf("testimonials/cards")).toBeGreaterThan(lastText)
  })

  it("keeps invented first names in the sample: one word each, no surname", () => {
    for (const { name } of testimonialsCards.fixtures!.sample.items) {
      for (const line of Object.values(name)) expect(line).toMatch(/^[А-ЯЁA-Z][а-яёa-z]+$/)
    }
  })

  it("may stand in a template, and a template's bad props are refused with their path", () => {
    const manifest = structuredClone(getTemplate("long-morning")!.manifest)
    manifest.sections.splice(1, 0, { block: "testimonials/cards", props: testimonialsCards.fixtures!.sample })
    const result = validateTemplate(manifest, blockById)
    expect(result.ok ? [] : result.errors).toEqual([])

    manifest.sections[1] = { block: "testimonials/cards", props: { layout: "masonry" } }
    const refused = validateTemplate(manifest, blockById)
    expect(refused.ok ? [] : refused.errors.map((e) => e.message)).toEqual(["layout must be one of: grid, carousel"])
  })
})
