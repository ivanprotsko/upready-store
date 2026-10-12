import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ImageRef } from "@modules/blocks/shared/image-ref"
import { SECTION_TYPE } from "@modules/blocks/shared/section-type"
import { getTemplate } from "@lib/templates/catalog"
import { validateTemplate } from "@lib/templates/manifest"

import { BLOCKS, CATEGORY_BLOCKS, blockById } from "../../registry"
import Multicolumn from "."
import { CARDS_SAMPLE, multicolumn } from "./block"
import { LINK_LABEL, parseMulticolumnProps, type MulticolumnItem, type MulticolumnProps } from "./props"

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
vi.mock("next/image", () => ({
  default: ({ fill, sizes, src, alt, className }: { fill?: boolean; sizes?: string; src: string; alt: string; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} sizes={sizes} className={className} data-fill={fill ? "" : undefined} />
  ),
}))

/** The shop's pictures: a category named `missing` is not in this shop, as `resolveImageRef` answers then. */
const resolved = vi.hoisted(() => ({ calls: [] as unknown[] }))
vi.mock("@lib/data/block-image", () => ({
  resolveImageRef: async (ref: ImageRef) => {
    resolved.calls.push(ref)
    if ("category" in ref && ref.category === "missing") return null
    const url = "src" in ref ? ref.src : `https://shop.example/${"category" in ref ? ref.category : ref.product}.webp`
    return { url, alt: ref.alt.ru ?? "", width: null, height: null }
  },
}))

const render = async (props: MulticolumnProps) => {
  const tree = await Multicolumn(props)
  return tree === null ? null : renderToStaticMarkup(tree)
}

const blank: MulticolumnProps = {
  header: null,
  items: [],
  mode: "icons",
  columns: 4,
  mobile: "one",
  align: "left",
  tone: "plain",
}

const point = (title: MulticolumnItem["title"], extra: Partial<MulticolumnItem> = {}): MulticolumnItem => ({
  image: null,
  icon: "truck",
  title,
  text: { ru: "Привезём за 1–5 дней" },
  link: null,
  ...extra,
})

const count = (html: string, needle: string) => html.split(needle).length - 1

/** The class `align: "center"` sets on every column. */
const CENTRE = "text-center"

beforeEach(() => {
  locale.current = "ru"
  resolved.calls = []
})

describe("parseMulticolumnProps", () => {
  it("reads absent props as an empty icons row, four columns, one on a phone, left and plain", () => {
    expect(parseMulticolumnProps(undefined)).toEqual({ ok: true, value: blank })
  })

  it("gives a link without a label the block's own Russian and English words", () => {
    const result = parseMulticolumnProps({
      items: [
        { icon: "truck", title: { ru: "Доставка" }, link: { href: "/shipping" } },
        { icon: "wallet", title: { ru: "Оплата" } },
      ],
    })
    expect(result.ok && result.value.items[0]).toEqual({
      image: null,
      icon: "truck",
      title: { ru: "Доставка" },
      text: {},
      link: { href: "/shipping", label: LINK_LABEL },
    })
    expect(result.ok && result.value.items[1].link).toBeNull()
    expect(LINK_LABEL.ru && LINK_LABEL.en).toBeTruthy()
  })

  it("refuses bad props with the path of every field", () => {
    const result = parseMulticolumnProps({
      items: [
        { icon: "truck", image: { category: "cookware" }, title: { ru: "Доставка" } },
        { icon: "rocket", title: { ru: "я".repeat(61) } },
        { title: { ru: "Возврат" }, text: { ru: "т".repeat(181) }, link: { href: "//evil.example" } },
        { image: { src: "https://cdn.example/a.png" }, title: { xx: "Guarantee" } },
      ],
      columns: 7,
      mobile: "three",
      mode: "list",
      footer: {},
    })
    expect(result.ok ? [] : result.errors).toEqual([
      "items[0]: image or icon, not both",
      "items[1].icon must be an icon of shared/icon-name.ts, e.g. truck, credit-card, shield-check",
      "items[1].title.ru is 61 characters, at most 60",
      "items[2].text.ru is 181 characters, at most 180",
      "items[2].link.href: // leads to another site; write https://",
      "items[3].image.src must be /templates/<template-id>/<file>.(avif|webp|jpg|png)",
      "items[3].title.xx: not a language of i18n/config.ts",
      "mode must be one of: icons, cards",
      "columns must be a whole number from 2 to 6",
      "mobile must be one of: one, two, swipe",
      "footer: not a prop of columns/multicolumn",
    ])
  })

  it("holds two to six items and needs a title object on each", () => {
    const one = parseMulticolumnProps({ items: [{ title: { ru: "Доставка" } }] })
    expect(one.ok ? [] : one.errors).toEqual(["items has 1 items, at least 2"])
    const seven = parseMulticolumnProps({ items: Array.from({ length: 7 }, () => ({ title: { ru: "Пункт" } })) })
    expect(seven.ok ? [] : seven.errors).toEqual(["items has 7 items, at most 6"])
    const untitled = parseMulticolumnProps({ items: [{ icon: "truck" }, { title: { ru: "Оплата" } }] })
    expect(untitled.ok ? [] : untitled.errors).toEqual(["items[0].title must be an object of language code to string"])
  })

  it("accepts both samples and the empty fixture", () => {
    expect(parseMulticolumnProps(multicolumn.fixtures!.sample)).toEqual({ ok: true, value: multicolumn.fixtures!.sample })
    expect(parseMulticolumnProps(multicolumn.fixtures!.empty)).toEqual({ ok: true, value: multicolumn.fixtures!.empty })
    expect(parseMulticolumnProps(CARDS_SAMPLE)).toEqual({ ok: true, value: CARDS_SAMPLE })
  })
})

describe("Multicolumn", () => {
  it("draws nothing when no item has a title in any language", async () => {
    expect(await render(blank)).toBeNull()
    expect(await render({ ...blank, items: [point({}), point({ ru: "   " }), point({ en: "" })] })).toBeNull()
    expect(await render(multicolumn.fixtures!.empty)).toBeNull()
  })

  it("skips an item with no title and caps the columns at the items shown", async () => {
    const html = (await render({ ...blank, columns: 4, items: [point({ ru: "Доставка" }), point({}), point({ ru: "Оплата" })] }))!
    expect(count(html, 'data-role="feature-card"')).toBe(2)
    expect(html).toContain("small:grid-cols-2")
    expect(html).not.toContain("small:grid-cols-4")
  })

  it("falls back to English, then any language, as pickText does", async () => {
    locale.current = "de"
    const html = (await render({ ...blank, items: [point({ en: "Delivery" }), point({ fr: "Paiement" })] }))!
    expect(html).toContain(">Delivery</h3>")
    expect(html).toContain(">Paiement</h3>")
  })

  it("draws the trust row in its section shell: icon, title, text and a link where given", async () => {
    const sample = multicolumn.fixtures!.sample
    const html = (await render(sample))!
    expect(html).toMatch(/^<section data-block="columns\/multicolumn" class="py-\[calc\(var\(--layer-section-gap,3rem\)\/2\)\]">/)
    expect(html).not.toContain('data-role="section-header"')
    expect(count(html, 'data-role="feature-card"')).toBe(4)
    expect(count(html, 'data-role="icon-wrapper"')).toBe(4)
    expect(count(html, 'data-role="icon"')).toBe(4)
    expect(count(html, "<svg")).toBe(4)
    expect(html).not.toContain('data-role="card-image"')
    expect(html).toMatch(/<h3 data-role="card-title"[^>]*>Доставка СДЭК и Почтой<\/h3>/)
    expect(html).toMatch(/<p data-role="description"[^>]*>В пункт выдачи или курьером, за 1–5 дней по всей России\.<\/p>/)
    expect(html).toMatch(/<a href="\/ru\/shipping" data-role="cta-secondary"[^>]*>Условия доставки<\/a>/)
    expect(html).toMatch(/<a href="\/ru\/returns" data-role="cta-secondary"[^>]*>Как вернуть<\/a>/)
    expect(count(html, 'data-role="cta-secondary"')).toBe(2)
    // One section scale: the column's text is the header's description, its link the header's «see all».
    expect(html).toContain(`<p data-role="description" class="${SECTION_TYPE.description}">`)
    expect(html).toMatch(new RegExp(`data-role="cta-secondary" class="[^"]*${SECTION_TYPE.seeAll}"`))
    expect(html).toContain("text-xl font-semibold tracking-[-0.02em] text-ui-fg-base small:text-2xl")
    expect(html).toContain("grid-cols-2")
    expect(html).toContain("xsmall:grid-cols-2")
    expect(html).toContain("small:grid-cols-4")
    expect(html).toContain(CENTRE)
    expect(resolved.calls).toEqual([])
  })

  it("draws the cards sample with the shop's pictures, its header and a row that swipes on a phone", async () => {
    const html = (await render(CARDS_SAMPLE))!
    expect(html).toContain('data-role="section-header"')
    expect(html).toMatch(/<h2 data-role="heading"[^>]*>С чего начать кухню<\/h2>/)
    expect(count(html, 'data-role="card-image"')).toBe(3)
    expect(html).not.toContain('data-role="icon-wrapper"')
    expect(html).toContain('src="https://shop.example/cookware.webp"')
    expect(html).toContain('alt="Чугунная жаровня на плите"')
    expect(html).toContain("aspect-[var(--layer-photo-aspect,1/1)]")
    expect(html).toContain("snap-x")
    expect(html).toContain("no-scrollbar")
    // The next card fades out at the screen's edge, so the row reads as going on, not cut off.
    expect(html).toContain("[mask-image:linear-gradient(to_right,black_calc(100%_-_1.5rem),transparent)]")
    expect(html).toContain("xsmall:[mask-image:none]")
    expect(html).toContain("small:grid-cols-3")
    expect(resolved.calls).toEqual(CARDS_SAMPLE.items.map((item) => item.image))
  })

  it("leaves no empty frame where the shop has no such picture, and keeps the item", async () => {
    const html = (await render({
      ...blank,
      mode: "cards",
      items: [
        point({ ru: "Посуда" }, { icon: null, image: { category: "missing", alt: {} } }),
        point({ ru: "Сервировка" }, { icon: null, image: { category: "tableware", alt: {} } }),
      ],
    }))!
    expect(count(html, 'data-role="feature-card"')).toBe(2)
    expect(count(html, 'data-role="card-image"')).toBe(1)
    expect(count(html, "<img")).toBe(1)
    expect(html).toContain(">Посуда</h3>")
  })

  it("draws an icon in cards mode, and a picture in icons mode, in the icon's place", async () => {
    const cards = (await render({ ...blank, mode: "cards", items: [point({ ru: "Доставка" }), point({ ru: "Оплата" })] }))!
    expect(count(cards, 'data-role="icon-wrapper"')).toBe(2)
    expect(cards).not.toContain('data-role="card-image"')

    const icons = (await render({
      ...blank,
      items: [
        point({ ru: "СБП" }, { icon: null, image: { src: "/templates/long-morning/sbp.png", alt: { ru: "СБП" } } }),
        point({ ru: "Доставка" }),
      ],
    }))!
    expect(count(icons, 'data-role="icon-wrapper"')).toBe(2)
    expect(icons).not.toContain('data-role="card-image"')
    expect(icons).toContain('src="/templates/long-morning/sbp.png"')
    expect(icons).toContain("object-contain")
  })

  it("lays out left and plain by default, centre and muted cards on request, tokens only", async () => {
    const items = [point({ ru: "Доставка" }), point({ ru: "Оплата" }), point({ ru: "Возврат" })]
    const plain = (await render({ ...blank, items }))!
    expect(plain).not.toContain(CENTRE)
    expect(plain).not.toMatch(/data-role="feature-card" class="[^"]*bg-\[var\(--muted\)\]/)
    expect(plain).toContain("grid-cols-1")
    expect(plain).toContain("xsmall:grid-cols-3")

    const muted = (await render({ ...blank, items, align: "center", tone: "muted", mobile: "two", columns: 6 }))!
    expect(count(muted, CENTRE)).toBe(3)
    expect(muted).toMatch(/data-role="feature-card" class="[^"]*bg-\[var\(--muted\)\]/)
    expect(muted).toContain("rounded-[var(--radius)]")
    expect(muted).toContain("small:grid-cols-3")
    expect(muted).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|oklch\(/i)
  })

  it("puts four or six columns two and three to a row at tablet width", async () => {
    const four = (await render({ ...blank, items: [1, 2, 3, 4].map((n) => point({ ru: `Пункт ${n}` })) }))!
    expect(four).toContain("xsmall:grid-cols-2")
    const six = (await render({ ...blank, columns: 6, items: [1, 2, 3, 4, 5, 6].map((n) => point({ ru: `Пункт ${n}` })) }))!
    expect(six).toContain("xsmall:grid-cols-3")
    expect(six).toContain("small:grid-cols-6")
  })

  it("draws an https link as a plain anchor and a link target at least 44px high", async () => {
    const html = (await render({
      ...blank,
      items: [
        point({ ru: "Telegram" }, { link: { href: "https://t.me/shop", label: { ru: "Написать" } } }),
        point({ ru: "Оплата" }),
      ],
    }))!
    expect(html).toMatch(/<a data-role="cta-secondary" href="https:\/\/t\.me\/shop"[^>]*>Написать<\/a>/)
    expect(html).toContain("min-h-11")
  })
})

describe("columns/multicolumn in the registry", () => {
  it("is a lab home block with the roles the brief names", () => {
    expect(blockById("columns/multicolumn")).toBe(multicolumn)
    expect(multicolumn).toMatchObject({ category: "columns", variant: "multicolumn", status: "lab", placement: "home" })
    expect(multicolumn.data).toContain("static")
    expect([...multicolumn.roles].sort()).toEqual(
      ["section-header", "feature-card", "card-image", "card-title", "description", "cta-secondary", "icon-wrapper", "icon"].sort()
    )
    expect(CATEGORY_BLOCKS.columns.map((b) => b.id)).toContain("columns/multicolumn")
    const ids = BLOCKS.map((b) => b.id)
    expect(ids.indexOf("columns/multicolumn")).toBeGreaterThan(ids.indexOf("announcement/text-bar"))
  })

  it("may stand in a template, and a template's bad props are refused with their path", () => {
    const manifest = structuredClone(getTemplate("long-morning")!.manifest)
    manifest.sections.splice(1, 0, { block: "columns/multicolumn", props: multicolumn.fixtures!.sample })
    const result = validateTemplate(manifest, blockById)
    expect(result.ok ? [] : result.errors).toEqual([])

    manifest.sections[1] = { block: "columns/multicolumn", props: { items: [{ title: { ru: "Доставка" } }], tone: "loud" } }
    const refused = validateTemplate(manifest, blockById)
    expect(refused.ok ? [] : refused.errors.map((e) => e.message)).toEqual([
      "items has 1 items, at least 2",
      "tone must be one of: plain, muted",
    ])
  })
})
