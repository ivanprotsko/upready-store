import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getTemplate } from "@lib/templates/catalog"
import { validateTemplate } from "@lib/templates/manifest"

import { BLOCKS, CATEGORY_BLOCKS, blockById } from "../../registry"
import type { ImageRef } from "../../shared/image-ref"
import ImageBanner from "."
import { image } from "./block"
import { MIN_BARE_OVERLAY, PRIMARY_LABEL, SECONDARY_LABEL, parseImageBannerProps, type ImageBannerProps } from "./props"

vi.mock("server-only", () => ({}))

const state = vi.hoisted(() => ({
  locale: "ru",
  /** What `resolveImageRef` answers per source, keyed by its handle or file; absent is null. */
  pictures: {} as Record<string, string>,
  calls: [] as unknown[],
}))
vi.mock("next-intl/server", () => ({ getLocale: async () => state.locale }))
vi.mock("@i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={`/ru${href}`} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock("@lib/data/block-image", () => ({
  resolveImageRef: async (ref: ImageRef) => {
    state.calls.push(ref)
    const key = "src" in ref ? ref.src : "category" in ref ? ref.category : ref.product
    const url = state.pictures[key]
    return url ? { url, alt: ref.alt.ru ?? "", width: null, height: null } : null
  },
}))
vi.mock("next/image", () => ({
  default: ({ src, alt, fill, width, height, sizes, className }: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src as string}
      alt={alt as string}
      loading="lazy"
      data-fill={fill ? "" : undefined}
      width={width as number | undefined}
      height={height as number | undefined}
      sizes={sizes as string}
      className={className as string}
    />
  ),
}))

const render = async (props: ImageBannerProps) => {
  const tree = await ImageBanner(props)
  return tree === null ? null : renderToStaticMarkup(tree)
}

const kitchen: ImageRef = { category: "the-kitchen", alt: { ru: "Сотейник" } }
const skillet: ImageRef = { product: "skillet", index: 0, alt: { ru: "Сковорода" } }

const blank: ImageBannerProps = {
  image: null,
  imageMobile: null,
  heading: {},
  text: {},
  primary: null,
  secondary: null,
  height: "medium",
  overlay: 0,
  contentPosition: "center",
  textBox: true,
  stackOnMobile: true,
}

beforeEach(() => {
  state.locale = "ru"
  state.pictures = { "the-kitchen": "https://cdn.test/braiser.webp", skillet: "https://cdn.test/skillet.webp" }
  state.calls = []
})

describe("parseImageBannerProps", () => {
  it("reads absent props as a medium banner without a picture, words centred on a card, under it on a phone", () => {
    expect(parseImageBannerProps(undefined)).toEqual({ ok: true, value: blank })
  })

  it("gives a button without a label the block's own Russian and English words", () => {
    const result = parseImageBannerProps({ primary: { href: "/store" }, secondary: { href: "/shipping" } })
    expect(result.ok && result.value.primary).toEqual({ href: "/store", label: PRIMARY_LABEL })
    expect(result.ok && result.value.secondary).toEqual({ href: "/shipping", label: SECONDARY_LABEL })
    expect(PRIMARY_LABEL.ru && PRIMARY_LABEL.en && SECONDARY_LABEL.ru && SECONDARY_LABEL.en).toBeTruthy()
  })

  it("refuses bad props with the path of every field", () => {
    const result = parseImageBannerProps({
      image: { product: "Чайник Большой" },
      imageMobile: { src: "https://cdn.example/a.jpg" },
      heading: { ru: "я".repeat(91) },
      primary: { label: { ru: "Каталог" } },
      height: "huge",
      overlay: 90,
      contentPosition: "middle",
      textBox: "yes",
      buttons: [],
    })
    expect(result.ok ? [] : result.errors).toEqual([
      "image.product must be a handle of the shop (letters, digits, - and _)",
      "imageMobile.src must be /templates/<template-id>/<file>.(avif|webp|jpg|png)",
      "heading.ru is 91 characters, at most 90",
      "primary.href is required",
      "height must be one of: small, medium, large, adapt",
      "overlay must be a whole number from 0 to 80",
      "contentPosition must be one of: top-left, top-center, top-right, center-left, center, center-right, bottom-left, bottom-center, bottom-right",
      "textBox must be true or false",
      "buttons: not a prop of banner/image",
    ])
  })

  it(`holds words straight on the picture to an overlay of ${MIN_BARE_OVERLAY} % or more`, () => {
    const bare = { image: kitchen, heading: { ru: "Распродажа" }, textBox: false }
    expect(parseImageBannerProps({ ...bare, overlay: MIN_BARE_OVERLAY - 1 })).toEqual({
      ok: false,
      errors: [
        `overlay is ${MIN_BARE_OVERLAY - 1}: words straight on the picture (textBox: false) need at least ${MIN_BARE_OVERLAY} to read on any picture; raise it or set textBox: true`,
      ],
    })
    expect(parseImageBannerProps({ ...bare }).ok).toBe(false)
    expect(parseImageBannerProps({ ...bare, heading: {}, secondary: { href: "/store" } }).ok).toBe(false)
    expect(parseImageBannerProps({ ...bare, overlay: MIN_BARE_OVERLAY }).ok).toBe(true)
    // On the card any overlay reads; a picture with no words needs none.
    expect(parseImageBannerProps({ ...bare, textBox: true, overlay: 10 }).ok).toBe(true)
    expect(parseImageBannerProps({ image: kitchen, heading: { ru: "  " }, textBox: false }).ok).toBe(true)
  })
})

describe("ImageBanner", () => {
  it("draws nothing without a picture, or with one the shop does not have", async () => {
    expect(await render({ ...blank, heading: { ru: "Распродажа" } })).toBeNull()
    expect(state.calls).toEqual([])
    expect(await render(image.fixtures!.empty)).toBeNull()

    state.pictures = {}
    expect(await render({ ...blank, image: kitchen, heading: { ru: "Распродажа" } })).toBeNull()
    expect(state.calls).toEqual([kitchen])
  })

  it("draws the sample full width in its section shell with every role, words in the content container", async () => {
    const html = (await render(image.fixtures!.sample))!
    expect(html).toMatch(/^<section data-block="banner\/image" class="py-\[calc\(var\(--layer-section-gap,3rem\)\/2\)\]"><div class="grid /)
    expect(html).toMatch(/<div data-role="hero-image"[^>]*><img src="https:\/\/cdn\.test\/skillet\.webp" alt="Сковорода из шлифованного чугуна"/)
    expect(html).toMatch(/<h2 data-role="headline"[^>]*>Чугун, который переживёт нас<\/h2>/)
    expect(html).toMatch(/<p data-role="description"[^>]*>Сотейники[^<]+<\/p>/)
    expect(html).toMatch(/<div data-role="cta-group"[^>]*><a href="\/ru\/categories\/cookware" data-role="cta-primary"[^>]*>Смотреть посуду<\/a><a href="\/ru\/shipping" data-role="cta-secondary"[^>]*>Доставка и оплата<\/a><\/div>/)
    expect(html).toContain("content-container")
    expect([...image.roles].sort()).toEqual(
      ["cta-group", "cta-primary", "cta-secondary", "description", "headline", "hero-image"].sort()
    )
  })

  it("lays the overlay in --background and the words in --foreground: never black, tokens only", async () => {
    const html = (await render({ ...blank, image: kitchen, heading: { ru: "Распродажа" }, overlay: 70, textBox: false }))!
    expect(html).toMatch(/<div aria-hidden="true" class="relative bg-\[var\(--background\)\][^"]*" style="opacity:0\.7"><\/div>/)
    expect(html).toContain("text-[var(--foreground)]")
    expect(html).not.toMatch(/\b(?:bg|text|border|from|via|to)-(?:black|white)\b|#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i)
    expect(await render({ ...blank, image: kitchen, heading: { ru: "Распродажа" } })).not.toContain('aria-hidden="true"')
  })

  it("puts the words on a --background card with the template's radius, or straight on the picture", async () => {
    const card = (await render({ ...blank, image: kitchen, heading: { ru: "Распродажа" }, stackOnMobile: false }))!
    expect(card).toContain("rounded-[var(--radius)] bg-[var(--background)] p-6")
    const bare = (await render({ ...blank, image: kitchen, heading: { ru: "Распродажа" }, overlay: 65, textBox: false }))!
    expect(bare).not.toContain("rounded-[var(--radius)] bg-[var(--background)]")
  })

  it("places the words in nine spots, the text aligned with its side", async () => {
    const at = async (contentPosition: ImageBannerProps["contentPosition"]) =>
      (await render({ ...blank, image: kitchen, heading: { ru: "Распродажа" }, contentPosition }))!
    expect(await at("top-left")).toMatch(/items-start justify-start[^"]*"><div class="[^"]*items-start text-left/)
    expect(await at("center")).toMatch(/items-center justify-center[^"]*"><div class="[^"]*items-center text-center/)
    expect(await at("bottom-right")).toMatch(/items-end justify-end[^"]*"><div class="[^"]*items-end text-right/)
  })

  it("puts the words under the picture on a phone with stackOnMobile, over it everywhere without", async () => {
    const props = { ...blank, image: kitchen, heading: { ru: "Распродажа" }, overlay: 40 }
    const stacked = (await render(props))!
    expect(stacked).toMatch(/pt-6 \[grid-area:2\/1\] [^"]*xsmall:\[grid-area:1\/1\]/)
    expect(stacked).toContain("hidden xsmall:block")
    expect(stacked).toContain("min-h-[calc(15rem*var(--layer-density,1))] xsmall:min-h-0")
    expect(stacked).toContain(
      "xsmall:min-h-[calc(22rem*var(--layer-density,1))] small:min-h-[calc(35rem*var(--layer-density,1))]"
    )

    const over = (await render({ ...props, stackOnMobile: false }))!
    expect(over).not.toContain("[grid-area:2/1]")
    expect(over).not.toContain("hidden xsmall:block")
    expect(over).toContain(
      'class="grid min-h-[calc(22rem*var(--layer-density,1))] small:min-h-[calc(35rem*var(--layer-density,1))]"'
    )
  })

  it("shows imageMobile below 512 px and image above it", async () => {
    const html = (await render({ ...blank, image: kitchen, imageMobile: skillet }))!
    expect(html).toMatch(/<img src="https:\/\/cdn\.test\/skillet\.webp"[^>]*class="[^"]*xsmall:hidden"/)
    expect(html).toMatch(/<img src="https:\/\/cdn\.test\/braiser\.webp"[^>]*class="[^"]*hidden xsmall:block"/)

    state.pictures = { "the-kitchen": "https://cdn.test/braiser.webp" }
    const alone = (await render({ ...blank, image: kitchen, imageMobile: skillet }))!
    expect(alone.match(/<img /g)).toHaveLength(1)
    expect(alone).not.toContain("xsmall:hidden")
  })

  it("fills a fixed height and takes the picture's own ratio with adapt", async () => {
    const fixed = (await render({ ...blank, image: kitchen, height: "large", stackOnMobile: false }))!
    expect(fixed).toMatch(/<img [^>]*data-fill=""/)
    expect(fixed).toContain("min-h-[calc(26rem*var(--layer-density,1))] small:min-h-[calc(45rem*var(--layer-density,1))]")

    const adapt = (await render({ ...blank, image: kitchen, height: "adapt", stackOnMobile: false }))!
    expect(adapt).not.toContain("data-fill")
    expect(adapt).toMatch(/<img [^>]*width="0" height="0"[^>]*class="block h-full w-full object-cover"/)
    expect(adapt).toMatch(/class="grid"/)
  })

  it("keeps the text plain: markup in the props is shown, not run", async () => {
    const html = (await render({ ...blank, image: kitchen, text: { ru: "<b>жирный</b> <script>alert(1)</script>" } }))!
    expect(html).not.toContain("<b>")
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;b&gt;жирный&lt;/b&gt;")
  })

  it("falls back to English, then any language, as pickText does", async () => {
    state.locale = "de"
    expect(await render({ ...blank, image: kitchen, heading: { fr: "Soldes" } })).toContain("Soldes")
  })
})

describe("banner/image in the registry", () => {
  it("is a lab home block reading its picture from the catalogue, after the newsletter blocks", () => {
    expect(blockById("banner/image")).toBe(image)
    expect(image).toMatchObject({ category: "banner", variant: "image", status: "lab", placement: "home" })
    expect([...image.data].sort()).toEqual(["categories", "products", "static"])
    expect(CATEGORY_BLOCKS.banner.map((b) => b.id)).toContain("banner/image")
    const ids = BLOCKS.map((b) => b.id)
    const before = BLOCKS.filter((b) => ["text", "newsletter"].includes(b.category)).map((b) => ids.indexOf(b.id))
    expect(ids.indexOf("banner/image")).toBeGreaterThan(Math.max(-1, ...before))
  })

  it("may stand in a template, and a template's bad props are refused with their path", () => {
    const manifest = structuredClone(getTemplate("long-morning")!.manifest)
    manifest.sections.splice(1, 0, { block: "banner/image", props: image.fixtures!.sample })
    const result = validateTemplate(manifest, blockById)
    expect(result.ok ? [] : result.errors).toEqual([])

    manifest.sections[1] = { block: "banner/image", props: { image: kitchen, heading: { ru: "Распродажа" }, textBox: false } }
    const refused = validateTemplate(manifest, blockById)
    expect(refused.ok ? [] : refused.errors.map((e) => e.message)).toEqual([
      `overlay is 0: words straight on the picture (textBox: false) need at least ${MIN_BARE_OVERLAY} to read on any picture; raise it or set textBox: true`,
    ])
  })
})
