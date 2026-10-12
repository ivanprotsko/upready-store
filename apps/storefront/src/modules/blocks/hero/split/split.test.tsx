import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import TemplateSections from "../../template-sections"
import { heroSplit } from "./block"
import HeroSplit from "."
import { PRIMARY_LABEL, parseHeroSplitProps, type HeroSplitProps } from "./props"

const resolveImageRef = vi.fn()

// The registry behind `TemplateSections` reaches `server-only` loaders through the header and
// footer variants. Hoisted by vitest.
vi.mock("server-only", () => ({}))

vi.mock("next-intl/server", () => ({ getLocale: async () => "ru" }))
vi.mock("@lib/data/block-image", () => ({ resolveImageRef: (...args: unknown[]) => resolveImageRef(...args) }))
vi.mock("@i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={`/ru${href}`} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock("next/image", () => ({
  default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    <span data-image={src} aria-label={alt} className={className} />
  ),
}))

const sample = heroSplit.fixtures!.sample
const render = async (props: Partial<HeroSplitProps> = {}) => {
  const element = await HeroSplit({ ...sample, ...props })
  return element ? renderToStaticMarkup(element) : null
}

beforeEach(() => {
  resolveImageRef.mockReset()
  resolveImageRef.mockResolvedValue({ url: "https://cdn.test/braiser.webp", alt: "Жаровня", width: null, height: null })
})

describe("parseHeroSplitProps", () => {
  it("fills every setting with its default and needs only a title", () => {
    const result = parseHeroSplitProps({ title: { ru: "Свежий хлеб" } })
    expect(result).toEqual({
      ok: true,
      value: {
        eyebrow: {},
        title: { ru: "Свежий хлеб" },
        lead: {},
        primary: null,
        secondary: null,
        facts: [],
        image: null,
        imageSide: "right",
        imageFit: "cover",
        tone: "plain",
        height: "auto",
      },
    })
  })

  it("refuses a template that gives it no title", () => {
    expect(parseHeroSplitProps(undefined)).toEqual({
      ok: false,
      errors: ["title must be an object of language code to string"],
    })
  })

  it("gives a button its default label and holds every list and setting to its limits", () => {
    const button = parseHeroSplitProps({ title: { ru: "x" }, primary: { href: "/store" } })
    expect(button.ok && button.value.primary).toEqual({ href: "/store", label: PRIMARY_LABEL })

    const result = parseHeroSplitProps({
      title: { ru: "x" },
      secondary: { href: "//evil.test", label: { ru: "y" } },
      facts: [{ ru: "1" }, { ru: "2" }, { ru: "3" }, { ru: "4" }, { ru: "5" }],
      image: { product: "braiser", category: "pans" },
      imageSide: "top",
      imageFit: "fill",
      tone: "loud",
      height: "full",
      cta: {},
    })
    expect(result.ok ? [] : result.errors).toEqual([
      "secondary.href: // leads to another site; write https://",
      "facts has 5 items, at most 4",
      "image must name exactly one of: product, category, src",
      "imageSide must be one of: left, right",
      "imageFit must be one of: cover, contain",
      "tone must be one of: plain, muted, panel",
      "height must be one of: auto, tall",
      "cta: not a prop of hero/split",
    ])
  })
})

describe("HeroSplit", () => {
  it("fills every role of its registry entry, with one h1", async () => {
    const html = (await render())!
    for (const role of heroSplit.roles) expect(html, role).toContain(`data-role="${role}"`)
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html).toMatch(/<h1 data-role="heading"[^>]*>Натуральные вещи для кухни/)
    expect(html).toContain('<section data-block="hero/split"')
    expect(resolveImageRef).toHaveBeenCalledWith(sample.image, "ru")
    expect(html).toContain('data-image="https://cdn.test/braiser.webp" aria-label="Жаровня"')
  })

  it("draws nothing without a title in any language", async () => {
    expect(await render({ title: {} })).toBeNull()
    expect(await render({ title: { de: "   " } })).toBeNull()
    expect(resolveImageRef).not.toHaveBeenCalled()
  })

  it("falls back to English, then to any language, for the title", async () => {
    expect(await render({ title: { en: "Fresh bread" } })).toContain(">Fresh bread</h1>")
    expect(await render({ title: { de: "Frisches Brot" } })).toContain(">Frisches Brot</h1>")
  })

  it("leaves the text alone across the full width when the picture does not resolve", async () => {
    resolveImageRef.mockResolvedValue(null)
    const html = (await render())!
    expect(html).not.toContain('data-role="hero-image"')
    expect(html).not.toContain("small:grid-cols-")
    expect(await render({ image: null })).not.toContain("data-image=")
  })

  it("puts the picture second on a phone and on the named side from 1024 px", async () => {
    const right = (await render())!
    expect(right).toContain("small:grid-cols-[5fr_6fr]")
    expect(right).not.toContain("small:order-first")
    expect(right.indexOf('data-role="heading"')).toBeLessThan(right.indexOf('data-role="hero-image"'))

    const left = (await render({ imageSide: "left" }))!
    expect(left).toContain("small:grid-cols-[6fr_5fr]")
    expect(left).toContain("small:order-first")
    expect(left.indexOf('data-role="heading"')).toBeLessThan(left.indexOf('data-role="hero-image"'))
  })

  it("crops the picture to the template's photo shape, or keeps it whole on a padded tile", async () => {
    const cover = (await render())!
    expect(cover).toContain("aspect-[var(--layer-photo-aspect,1/1)]")
    expect(cover).toContain('class="object-cover"')
    const contain = (await render({ imageFit: "contain" }))!
    expect(contain).toContain("bg-[var(--muted)]")
    expect(contain).toMatch(/class="object-contain p-6/)
  })

  it("is tall only from 1024 px, never on a phone", async () => {
    const tall = (await render({ height: "tall" }))!
    expect(tall.match(/min-h-\[70vh\]/g)?.length).toBeGreaterThan(0)
    expect(tall).not.toMatch(/(?<!small:)min-h-\[70vh\]/)
    expect(await render()).not.toContain("min-h-[70vh]")
  })

  it("puts the muted surface under the block or a card panel behind the text", async () => {
    expect(await render()).not.toContain("bg-[var(--muted)]")
    expect(await render({ tone: "muted" })).toContain("bg-[var(--muted)] p-6")
    expect(await render({ tone: "panel" })).toContain("border-[var(--border)] bg-[var(--card)]")
  })

  it("dresses the primary button in the template's button layer, the secondary in the theme's secondary pair, and links in the shop's locale", async () => {
    const html = (await render())!
    expect(html).toMatch(
      /<a href="\/ru\/store" data-role="cta-primary" class="[^"]*bg-\[var\(--layer-button-bg,var\(--primary\)\)\][^"]*">Смотреть каталог<\/a>/
    )
    expect(html).toMatch(
      /<a href="\/ru\/journal" data-role="cta-secondary" class="[^"]*bg-\[var\(--secondary\)\] text-\[var\(--secondary-foreground\)\][^"]*">Как мы выбираем<\/a>/
    )
    const outside = (await render({ secondary: { href: "https://example.test/about", label: { ru: "О нас" } } }))!
    expect(outside).toMatch(/<a data-role="cta-secondary" href="https:\/\/example.test\/about"/)
    const none = (await render({ primary: null, secondary: null }))!
    expect(none).not.toContain('data-role="cta-group"')
  })

  it("draws each fact with a check, the empty ones skipped", async () => {
    const html = (await render({ facts: [{ ru: "Доставка за день" }, { en: "" }, { ru: "Возврат 30 дней" }] }))!
    expect(html.match(/<li /g)).toHaveLength(2)
    expect(html.match(/data-role="icon"/g)).toHaveLength(2)
    expect(await render({ facts: [] })).not.toContain("<ul")
  })

  it("scales the h1 with clamp() and breaks a long word rather than overflow", async () => {
    const html = (await render())!
    const h1 = html.match(/<h1[^>]*class="([^"]*)"/)![1].split(" ")
    expect(h1).toContain("text-[clamp(2rem,1.4rem+2.6vw,3rem)]")
    expect(h1).toContain("break-words")
  })
})

describe("a template's home page", () => {
  const slots = { hero: <p>composition hero</p>, categories: null, products: null }

  it("draws hero/split from the registry with the template's props, not the shop's hero slot", () => {
    const [split] = TemplateSections({ sections: [{ block: "hero/split", props: { title: { ru: "Свежий хлеб" } } }], slots }) as {
      type: unknown
      props: HeroSplitProps
    }[]
    expect(split.type).toBe(HeroSplit)
    expect(split.props.title).toEqual({ ru: "Свежий хлеб" })
    expect(split.props.imageSide).toBe("right")
  })

  it("still gives a composition hero the shop's own slot", () => {
    const [hero] = TemplateSections({ sections: [{ block: "hero/h" }], slots }) as { props: { children: unknown } }[]
    expect(hero.props.children).toBe(slots.hero)
  })
})
