import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { PROFILE_DEFAULTS } from "@lib/theme/composition"
import { TEMPLATE_SCHEMA, validateTemplate } from "@lib/templates/manifest"

import { blockById } from "../../registry"
import TemplateSections from "../../template-sections"
import { heroType } from "./block"
import HeroType from "."
import { PRIMARY_LABEL, parseHeroTypeProps, type HeroTypeProps } from "./props"

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

const sample = heroType.fixtures!.sample
const render = async (props: Partial<HeroTypeProps> = {}) => {
  const element = await HeroType({ ...sample, ...props })
  return element ? renderToStaticMarkup(element) : null
}
const classOf = (html: string, tag: string) => html.match(new RegExp(`<${tag}[^>]*class="([^"]*)"`))![1].split(" ")

beforeEach(() => {
  resolveImageRef.mockReset()
  resolveImageRef.mockImplementation(async (ref: { product: string }) => ({
    url: `https://cdn.test/${ref.product}.webp`,
    alt: ref.product,
    width: null,
    height: null,
  }))
})

describe("parseHeroTypeProps", () => {
  it("fills every setting with its default and needs only a title", () => {
    expect(parseHeroTypeProps({ title: { ru: "Коллекция осень-зима" } })).toEqual({
      ok: true,
      value: {
        eyebrow: {},
        title: { ru: "Коллекция осень-зима" },
        lead: {},
        primary: null,
        images: [],
        align: "left",
        scale: "large",
        rule: false,
      },
    })
  })

  it("refuses a template that gives it no title", () => {
    expect(parseHeroTypeProps(undefined)).toEqual({
      ok: false,
      errors: ["title must be an object of language code to string"],
    })
  })

  it("gives the button its default label and holds every list and setting to its limits", () => {
    const button = parseHeroTypeProps({ title: { ru: "x" }, primary: { href: "/store" } })
    expect(button.ok && button.value.primary).toEqual({ href: "/store", label: PRIMARY_LABEL })

    const image = { product: "braiser" }
    const result = parseHeroTypeProps({
      title: { ru: "x".repeat(71) },
      primary: { href: "//evil.test" },
      images: [image, image, { category: "pans", src: "/templates/x/a.webp" }, image],
      align: "right",
      scale: "giant",
      rule: "yes",
      secondary: {},
    })
    expect(result.ok ? [] : result.errors).toEqual([
      "title.ru is 71 characters, at most 70",
      "primary.href: // leads to another site; write https://",
      "images has 4 items, at most 3",
      "images[2] must name exactly one of: product, category, src",
      "align must be one of: left, center",
      "scale must be one of: large, huge",
      "rule must be true or false",
      "secondary: not a prop of hero/type",
    ])
  })
})

describe("HeroType", () => {
  it("fills every role of its registry entry, with one h1", async () => {
    const html = (await render())!
    for (const role of heroType.roles) expect(html, role).toContain(`data-role="${role}"`)
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html).toMatch(/<h1 data-role="headline"[^>]*>Коллекция осень-зима<\/h1>/)
    expect(html).toContain('<section data-block="hero/type"')
  })

  it("draws nothing without a title in any language", async () => {
    expect(await render({ title: {} })).toBeNull()
    expect(await render({ title: { de: "   " } })).toBeNull()
    expect(resolveImageRef).not.toHaveBeenCalled()
  })

  it("falls back to English, then to any language, for the title", async () => {
    expect(await render({ title: { en: "Autumn" } })).toContain(">Autumn</h1>")
    expect(await render({ title: { de: "Herbst" } })).toContain(">Herbst</h1>")
  })

  it("keeps the template's own line break in the headline", async () => {
    const html = (await render({ title: { ru: "Коллекция\nосень-зима" } }))!
    expect(html).toContain(">Коллекция\nосень-зима</h1>")
    expect(classOf(html, "h1")).toContain("whitespace-pre-line")
  })

  it("draws up to three of the shop's pictures in order, skips one it no longer has, and leaves the headline alone with none", async () => {
    const html = (await render())!
    expect(resolveImageRef.mock.calls).toEqual(sample.images.map((image) => [image, "ru"]))
    expect(html.match(/data-role="media"/g)).toHaveLength(3)
    expect(html.indexOf("braiser.webp")).toBeLessThan(html.indexOf("mug.webp"))
    expect(html).toContain('data-image="https://cdn.test/candle-holder.webp" aria-label="candle-holder"')

    resolveImageRef.mockImplementation(async (ref: { product: string }) =>
      ref.product === "mug" ? null : { url: `https://cdn.test/${ref.product}.webp`, alt: ref.product, width: null, height: null }
    )
    const skipped = (await render())!
    expect(skipped.match(/data-role="media"/g)).toHaveLength(2)
    expect(skipped).not.toContain("mug.webp")

    resolveImageRef.mockResolvedValue(null)
    const none = (await render())!
    expect(none).not.toContain('data-role="media"')
    expect(none).not.toContain("<ul")
    expect(none).not.toContain("small:flex-row")
  })

  it("puts each picture in the template's photo shape, small, never as an empty frame", async () => {
    const html = (await render())!
    const box = html.match(/<li[^>]*data-role="media"[^>]*class="([^"]*)"/)![1].split(" ")
    expect(box).toEqual(expect.arrayContaining(["aspect-[var(--layer-photo-aspect,1/1)]", "w-20", "small:w-36", "overflow-hidden"]))
    expect(box.some((name) => name.startsWith("bg-"))).toBe(false)
  })

  it("sets the pictures beside the line and the button from 1024 px when left-aligned, and centres everything otherwise", async () => {
    const left = (await render())!
    expect(left).toContain("small:flex-row small:items-end small:justify-between")
    expect(left.indexOf('data-role="headline"')).toBeLessThan(left.indexOf('data-role="media"'))
    expect(left).not.toContain("text-center")

    const center = (await render({ align: "center" }))!
    expect(center).not.toContain("small:flex-row")
    expect(center).toContain("items-center text-center")
  })

  it("takes the headline to the top of the type scale in huge, with clamp() and tight leading, and breaks a word only when it cannot fit", async () => {
    const huge = classOf((await render())!, "h1")
    expect(huge).toContain("text-[clamp(3rem,0.5rem+7vw,6rem)]")
    expect(huge).toContain("font-[family-name:var(--font-display,inherit)]")
    expect(huge).toContain("leading-[1.05]")
    expect(huge).toContain("break-words")
    expect(huge).not.toContain("break-all")
    const large = classOf((await render({ scale: "large" }))!, "h1")
    expect(large).toEqual(expect.arrayContaining(["text-[clamp(2.25rem,0.5rem+4.2vw,3.75rem)]", "leading-[1.05]"]))
  })

  it("draws the thin rule under the eyebrow only when asked and only with an eyebrow", async () => {
    const ruled = (await render())!
    expect(ruled).toMatch(/data-role="label"[^>]*>Осень — зима 2026<\/p><span aria-hidden="true" class="[^"]*bg-\[var\(--border\)\]/)
    expect(await render({ rule: false })).not.toContain("bg-[var(--border)]")
    const bare = (await render({ eyebrow: {} }))!
    expect(bare).not.toContain('data-role="label"')
    expect(bare).not.toContain("bg-[var(--border)]")
  })

  it("dresses the one button in the template's button layer, links in the shop's locale, and drops it when there is none", async () => {
    const html = (await render())!
    expect(html).toMatch(
      /<a href="\/ru\/store" data-role="cta-primary" class="[^"]*bg-\[var\(--layer-button-bg,var\(--primary\)\)\][^"]*">Смотреть коллекцию<\/a>/
    )
    const outside = (await render({ primary: { href: "https://example.test/lookbook", label: { ru: "Лукбук" } } }))!
    expect(outside).toMatch(/<a data-role="cta-primary" href="https:\/\/example.test\/lookbook"/)
    expect(await render({ primary: null })).not.toContain('data-role="cta-primary"')
  })

  it("draws the headline alone for the empty fixture", async () => {
    const html = (await HeroType(heroType.fixtures!.empty).then((el) => (el ? renderToStaticMarkup(el) : null)))!
    expect(html).toContain('data-role="headline"')
    for (const role of ["label", "description", "cta-primary", "media"]) expect(html, role).not.toContain(`data-role="${role}"`)
  })
})

describe("a template's home page", () => {
  const slots = { hero: <p>composition hero</p>, categories: null, products: null }
  const template = (heroSetting: string) => ({
    schema: TEMPLATE_SCHEMA,
    id: "probe",
    title: "Probe",
    description: "A template for the hero/type tests.",
    settings: { ...PROFILE_DEFAULTS["home-goods"], footer: "f1", hero: heroSetting },
    theme: {
      palette: "home-goods",
      fontPair: { display: "Playfair Display", body: "Manrope" },
      radius: "sharp",
      buttonStyle: "filled",
      photoStyle: "portrait",
      density: "spacious",
    },
    sections: [{ block: "hero/type", props: sample }, { block: "tiles/on" }, { block: "listing/p4" }],
  })
  const messages = (input: unknown) => {
    const result = validateTemplate(input, blockById)
    return result.ok ? [] : result.errors.map((e) => `${e.field}: ${e.message}`)
  }

  it("takes the hero's place when settings turn the composition hero off, and is refused beside one", () => {
    expect(messages(template("none"))).toEqual([])
    expect(messages(template("h"))).toEqual([
      'sections[0].block: hero/type takes the hero slot itself and needs settings.hero "none", the template says "h".',
    ])
  })

  it("is drawn from the registry with the template's props, not the shop's hero slot", () => {
    const [hero] = TemplateSections({ sections: [{ block: "hero/type", props: { title: { ru: "Коллекция осень-зима" } } }], slots }) as {
      type: unknown
      props: HeroTypeProps
    }[]
    expect(hero.type).toBe(HeroType)
    expect(hero.props.title).toEqual({ ru: "Коллекция осень-зима" })
    expect(hero.props.scale).toBe("large")
  })
})
