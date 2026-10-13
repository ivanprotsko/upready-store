import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getTemplate } from "@lib/templates/catalog"
import { validateTemplate } from "@lib/templates/manifest"

import { blockById, CATEGORY_BLOCKS } from "../../registry"
import { SECTION_TYPE } from "../../shared/section-type"
import ImageWithText from "."
import { imageWithText } from "./block"
import { BUTTON_LABEL, parseImageWithTextProps, type ImageWithTextProps } from "./props"

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

const resolveImageRef = vi.hoisted(() => vi.fn())
vi.mock("@lib/data/block-image", () => ({ resolveImageRef }))

vi.mock("next/image", () => ({
  default: ({ src, alt, fill, sizes, className }: { src: string; alt: string; fill?: boolean; sizes?: string; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element -- a stand-in for next/image in the test
    <img src={src} alt={alt} data-fill={fill ? "true" : "false"} sizes={sizes} className={className} />
  ),
}))

const render = async (props: ImageWithTextProps) => {
  const tree = await ImageWithText(props)
  return tree === null ? null : renderToStaticMarkup(tree)
}

const blank: ImageWithTextProps = {
  image: null,
  eyebrow: {},
  heading: {},
  text: {},
  button: null,
  imageSide: "left",
  imageWidth: "1/2",
  imageAspect: "auto",
  verticalAlign: "center",
  tone: "plain",
}

const picture = { product: "braiser", index: 0, alt: {} }
const filled: ImageWithTextProps = { ...blank, image: picture, heading: { ru: "Чугун на всю жизнь" } }

/** The class list of the element carrying `data-role="<role>"`. */
const classOf = (html: string, role: string) => html.match(new RegExp(`data-role="${role}"[^>]*class="([^"]*)"`))?.[1] ?? ""

beforeEach(() => {
  locale.current = "ru"
  resolveImageRef.mockReset()
  resolveImageRef.mockResolvedValue({ url: "https://shipshift.dev/static/braiser.webp", alt: "Жаровня", width: null, height: null })
})

describe("parseImageWithTextProps", () => {
  it("reads absent props as a text-only section, picture left at a half, centred, plain", () => {
    expect(parseImageWithTextProps(undefined)).toEqual({ ok: true, value: blank })
  })

  it("takes a picture of the shop's own product and gives the button the block's own words", () => {
    const result = parseImageWithTextProps({ image: { product: "braiser" }, button: { href: "/store" } })
    expect(result.ok && result.value.image).toEqual(picture)
    expect(result.ok && result.value.button).toEqual({ href: "/store", label: BUTTON_LABEL })
    expect(BUTTON_LABEL.ru && BUTTON_LABEL.en).toBeTruthy()
  })

  it("refuses bad props with the path of every field", () => {
    const result = parseImageWithTextProps({
      image: { product: "Bad Handle" },
      heading: { ru: "я".repeat(121) },
      button: { label: { ru: "Купить" } },
      imageWidth: "3/4",
      imageAspect: "wide",
      verticalAlign: "middle",
      layout: "overlap",
    })
    expect(result.ok ? [] : result.errors).toEqual([
      "image.product must be a handle of the shop (letters, digits, - and _)",
      "heading.ru is 121 characters, at most 120",
      "button.href is required",
      "imageWidth must be one of: 1/3, 1/2, 2/3",
      "imageAspect must be one of: auto, square, portrait, landscape",
      "verticalAlign must be one of: top, center, bottom",
      "layout: not a prop of media/image-with-text",
    ])
  })
})

describe("ImageWithText", () => {
  it("draws nothing without a heading and a text, picture, eyebrow and button or not", async () => {
    expect(await render(blank)).toBeNull()
    expect(
      await render({
        ...blank,
        image: picture,
        eyebrow: { ru: "Из чугуна" },
        heading: { ru: "  " },
        button: { label: BUTTON_LABEL, href: "/store" },
      })
    ).toBeNull()
    expect(await render(imageWithText.fixtures!.empty)).toBeNull()
  })

  it("draws the text alone, full width, when the picture is not there", async () => {
    resolveImageRef.mockResolvedValue(null)
    const html = (await render(filled))!
    expect(resolveImageRef).toHaveBeenCalledWith(picture, "ru")
    expect(html).toContain('data-role="heading"')
    expect(html).not.toContain('data-role="media"')
    expect(html).not.toContain("<img")
    expect(html).not.toContain("grid-cols")

    resolveImageRef.mockClear()
    const textOnly = (await render({ ...blank, text: { ru: "Отправляем в день заказа." } }))!
    expect(resolveImageRef).not.toHaveBeenCalled()
    expect(textOnly).toContain('data-role="description"')
    expect(textOnly).not.toContain('data-role="media"')
  })

  it("falls back to English, then any language, as pickText does", async () => {
    locale.current = "de"
    expect(await render({ ...blank, heading: { fr: "Fonte pour la vie" } })).toContain("Fonte pour la vie")
  })

  it("draws the sample in its section shell, the picture filling its frame, with every role", async () => {
    const sample = imageWithText.fixtures!.sample
    const html = (await render(sample))!
    expect(resolveImageRef).toHaveBeenCalledWith(sample.image, "ru")
    // React hoists a preload of the stand-in <img> ahead of the tree; the section is still the root.
    expect(html.replace(/^<link rel="preload"[^>]*\/>/, "")).toMatch(
      /^<section data-block="media\/image-with-text" class="py-\[calc\(var\(--layer-section-gap,3rem\)\/2\)\]">/
    )
    expect(html).toMatch(/<div data-role="media"[^>]*>.*<img src="https:\/\/shipshift\.dev\/static\/braiser\.webp" alt="Жаровня" data-fill="true"/)
    expect(html).toMatch(/<p data-role="label"[^>]*>[^<]+<\/p>/)
    expect(html).toMatch(/<h2 data-role="heading"[^>]*>[^<]+<\/h2>/)
    expect(html).toMatch(/<p data-role="description"[^>]*>[^<]+<\/p>/)
    expect(classOf(html, "description")).toContain("whitespace-pre-line")
    // The shell's type (BLOCK-CONTRACT.md §3), so a template's page has one size per role.
    expect(classOf(html, "label")).toBe(SECTION_TYPE.label)
    expect(classOf(html, "heading")).toContain(SECTION_TYPE.heading)
    expect(classOf(html, "description")).toContain(SECTION_TYPE.description)
    expect(html).toMatch(/<a href="\/ru\/[^"]+" data-role="cta-primary"[^>]*>[^<]+<\/a>/)
  })

  it("stacks the picture above the words and puts it on the chosen side from 720 px", async () => {
    const left = (await render(filled))!
    expect(left.indexOf('data-role="media"')).toBeLessThan(left.indexOf('data-role="heading"'))
    expect(left).toContain("min-[720px]:grid-cols-2")
    expect(classOf(left, "media")).not.toContain("order-last")

    const right = (await render({ ...filled, imageSide: "right" }))!
    expect(right.indexOf('data-role="media"')).toBeLessThan(right.indexOf('data-role="heading"'))
    expect(classOf(right, "media")).toContain("min-[720px]:order-last")
  })

  it("gives the picture its share of the row from 1024 px, and the image the matching sizes", async () => {
    const cases = [
      ["1/3", "left", "small:grid-cols-[1fr_2fr]", "33vw"],
      ["1/3", "right", "small:grid-cols-[2fr_1fr]", "33vw"],
      ["2/3", "left", "small:grid-cols-[2fr_1fr]", "66vw"],
      ["2/3", "right", "small:grid-cols-[1fr_2fr]", "66vw"],
      ["1/2", "left", "min-[720px]:grid-cols-2", "50vw"],
    ] as const
    for (const [imageWidth, imageSide, columns, share] of cases) {
      const html = (await render({ ...filled, imageWidth, imageSide }))!
      expect(html, `${imageWidth} ${imageSide}`).toContain(columns)
      expect(html, `${imageWidth} ${imageSide}`).toContain(`sizes="(min-width: 1024px) ${share}, (min-width: 720px) 50vw, 100vw"`)
    }
    const half = (await render(filled))!
    expect(half).not.toContain("small:grid-cols-[")
  })

  it("frames the picture in the template's photo ratio, or its own", async () => {
    const ratios = {
      auto: "aspect-[var(--layer-photo-aspect,1/1)]",
      square: "aspect-square",
      portrait: "aspect-[3/4]",
      landscape: "aspect-[4/3]",
    } as const
    for (const [imageAspect, ratio] of Object.entries(ratios)) {
      const html = (await render({ ...filled, imageAspect: imageAspect as ImageWithTextProps["imageAspect"] }))!
      expect(html, imageAspect).toContain(ratio)
    }
  })

  it("stands the words at the top, centre or bottom against the picture", async () => {
    for (const [verticalAlign, justify] of [
      ["top", "justify-start"],
      ["center", "justify-center"],
      ["bottom", "justify-end"],
    ] as const) {
      const html = (await render({ ...filled, verticalAlign }))!
      expect(html, verticalAlign).toContain(justify)
    }
  })

  it("puts the words on a muted panel on request, tokens only, and the button in the template's button layer", async () => {
    const plain = (await render({ ...filled, button: { label: BUTTON_LABEL, href: "/store" } }))!
    expect(plain).not.toContain("bg-[var(--muted)] px-")
    expect(plain).toContain("bg-[var(--layer-button-bg,var(--primary))]")
    expect(plain).toContain("text-[var(--layer-button-fg,var(--primary-foreground))]")

    const muted = (await render({ ...filled, tone: "muted" }))!
    expect(muted).toMatch(/class="[^"]*rounded-\[var\(--radius\)\][^"]*bg-\[var\(--muted\)\][^"]*"[^>]*>\s*(<p data-role="label"|<h2)/)
    expect(muted).toContain("rounded-[var(--radius)]")
    expect(muted).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|oklch\(/i)
  })

  it("keeps the text plain: markup in the props is shown, not run", async () => {
    const html = (await render({ ...blank, text: { ru: "<b>жирный</b> <script>alert(1)</script>" } }))!
    expect(html).not.toContain("<b>")
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;b&gt;жирный&lt;/b&gt;")
  })

  it("leads an https button to a plain anchor", async () => {
    const html = (await render({ ...filled, button: { label: { ru: "Telegram" }, href: "https://t.me/shop" } }))!
    expect(html).toMatch(/<a data-role="cta-primary" href="https:\/\/t\.me\/shop"[^>]*>Telegram<\/a>/)
  })
})

describe("media/image-with-text in the registry", () => {
  it("is a lab home block that reads products and categories through its picture", () => {
    expect(blockById("media/image-with-text")).toBe(imageWithText)
    expect(imageWithText).toMatchObject({
      category: "media",
      variant: "image-with-text",
      data: ["products", "categories", "static"],
      status: "lab",
      placement: "home",
    })
    expect([...imageWithText.roles].sort()).toEqual(["cta-primary", "description", "heading", "label", "media"])
    expect(CATEGORY_BLOCKS.media.map((b) => b.id)).toContain("media/image-with-text")
  })

  it("may stand in a template several times, and a template's bad props are refused with their path", () => {
    const manifest = structuredClone(getTemplate("long-morning")!.manifest)
    const sample = imageWithText.fixtures!.sample
    manifest.sections.splice(1, 0, { block: "media/image-with-text", props: sample })
    manifest.sections.splice(2, 0, { block: "media/image-with-text", props: { ...sample, imageSide: "right" } })
    const result = validateTemplate(manifest, blockById)
    expect(result.ok ? [] : result.errors).toEqual([])

    manifest.sections[1] = { block: "media/image-with-text", props: { image: { src: "https://example.com/a.jpg" } } }
    const refused = validateTemplate(manifest, blockById)
    expect(refused.ok ? [] : refused.errors.map((e) => e.message)).toEqual([
      "image.src must be /templates/<template-id>/<file>.(avif|webp|jpg|png)",
    ])
  })
})
