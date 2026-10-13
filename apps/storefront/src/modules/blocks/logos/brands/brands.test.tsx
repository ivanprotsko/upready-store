import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { BLOCKS, CATEGORY_BLOCKS, blockById } from "../../registry"
import type { ImageRef } from "../../shared/image-ref"
import LogosBrands from "."
import { brands } from "./block"
import { LOGO_NAME_MAX, parseLogosBrandsProps, type BrandLogo, type LogosBrandsProps } from "./props"

vi.mock("server-only", () => ({}))

const state = vi.hoisted(() => ({
  locale: "ru",
  /** What `resolveImageRef` answers per source, keyed by its handle or file; absent is null. */
  pictures: {} as Record<string, string>,
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
    const key = "src" in ref ? ref.src : "category" in ref ? ref.category : ref.product
    const url = state.pictures[key] ?? ("src" in ref ? ref.src : undefined)
    return url ? { url, alt: ref.alt.ru ?? "", width: null, height: null } : null
  },
}))
vi.mock("next/image", () => ({
  default: ({ src, alt, fill, sizes, className }: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src as string} alt={alt as string} data-fill={fill ? "" : undefined} sizes={sizes as string} className={className as string} />
  ),
}))

const render = async (props: LogosBrandsProps) => {
  const tree = await LogosBrands(props)
  return tree === null ? null : renderToStaticMarkup(tree)
}

const logo = (handle: string, name: string, href: string | null = null): BrandLogo => ({
  image: { product: handle, index: 0, alt: {} },
  name: { ru: name },
  href,
})

const props = (logos: BrandLogo[], extra: Partial<LogosBrandsProps> = {}): LogosBrandsProps => ({
  header: null,
  logos,
  style: "cards",
  columns: 6,
  monochrome: false,
  ...extra,
})

const errors = (input: unknown) => {
  const result = parseLogosBrandsProps(input)
  return result.ok ? [] : result.errors
}

const named = (name: string) => ({ image: { product: "kettle" }, name: { ru: name } })

/** Each `<li>` of the list: its inner markup. */
const items = (html: string) => Array.from(html.matchAll(/<li data-role="logo"[^>]*>(.*?)<\/li>/g), (m) => m[1])

beforeEach(() => {
  state.locale = "ru"
  state.pictures = {
    kettle: "https://cdn.test/kettle.png",
    pan: "https://cdn.test/pan.png",
    mug: "https://cdn.test/mug.png",
  }
})

describe("parseLogosBrandsProps", () => {
  it("reads absent props as no header, no logos, cards, six columns, in colour", () => {
    expect(parseLogosBrandsProps(undefined)).toEqual({
      ok: true,
      value: { header: null, logos: [], style: "cards", columns: 6, monochrome: false },
    })
  })

  it("accepts the sample and the empty fixture", () => {
    expect(parseLogosBrandsProps(brands.fixtures!.sample).ok).toBe(true)
    expect(parseLogosBrandsProps(brands.fixtures!.empty).ok).toBe(true)
  })

  it("holds two to twelve logos", () => {
    expect(errors({ logos: [named("Kilnhouse")] })).toEqual(["logos has 1 items, at least 2"])
    expect(errors({ logos: Array(13).fill(named("Kilnhouse")) })).toEqual(["logos has 13 items, at most 12"])
    expect(errors({ logos: Array(12).fill(named("Kilnhouse")) })).toEqual([])
  })

  it("refuses a logo without a name: the name is the picture's alt and the link's name", () => {
    expect(errors({ logos: [named("Kilnhouse"), { image: { product: "pan" } }] })).toEqual([
      "logos[1].name is required: the brand's name, the picture's alt and the link's name",
    ])
    expect(errors({ logos: [named("Kilnhouse"), { image: { product: "pan" }, name: {} }] })).toEqual([
      "logos[1].name is required: the brand's name, the picture's alt and the link's name",
    ])
    expect(errors({ logos: [named("Kilnhouse"), { image: { product: "pan" }, name: { ru: "" } }] })).toEqual([
      "logos[1].name is required: the brand's name, the picture's alt and the link's name",
    ])
    expect(errors({ logos: [named("я".repeat(LOGO_NAME_MAX + 1)), named("Ольха")] })).toEqual([
      `logos[0].name.ru is ${LOGO_NAME_MAX + 1} characters, at most ${LOGO_NAME_MAX}`,
    ])
    expect(LOGO_NAME_MAX).toBe(40)
  })

  it("refuses a bad href, a logo without a picture, and bad settings, with the path of every field", () => {
    expect(
      errors({
        logos: [
          { ...named("Kilnhouse"), href: "//evil.example" },
          { ...named("Ольха"), href: "javascript:alert(1)" },
          { name: { ru: "Brightpan" }, href: "/categories/pans" },
        ],
        style: "grid",
        columns: 2,
        monochrome: "yes",
        title: { ru: "Бренды" },
      })
    ).toEqual([
      "logos[0].href: // leads to another site; write https://",
      "logos[1].href must start with / or https://",
      "logos[2].image is required",
      "style must be one of: cards, plain",
      "columns must be a whole number from 3 to 6",
      "monochrome must be true or false",
      "title: not a prop of logos/brands",
    ])
  })

  it("keeps a link inside the shop and an https address", () => {
    const result = parseLogosBrandsProps({
      logos: [
        { ...named("Kilnhouse"), href: "/categories/kilnhouse" },
        { ...named("Ольха"), href: "https://olkha.example/" },
      ],
    })
    expect(result.ok && result.value.logos.map((item) => item.href)).toEqual(["/categories/kilnhouse", "https://olkha.example/"])
  })
})

describe("LogosBrands", () => {
  it("draws the logos as a list, the name as the picture's alt", async () => {
    const html = (await render(props([logo("kettle", "Kilnhouse"), logo("pan", "Ольха"), logo("mug", "Brightpan")])))!
    expect(html).toContain('data-block="logos/brands"')
    expect(html.match(/<ul[ >]/g)).toHaveLength(1)
    const shown = items(html)
    expect(shown).toHaveLength(3)
    expect(shown.map((body) => body.match(/<img[^>]* alt="([^"]*)"/)?.[1])).toEqual(["Kilnhouse", "Ольха", "Brightpan"])
    // No heading of its own: the shell draws the section's.
    expect(html).not.toMatch(/<h[1-6]/)
  })

  it("names the picture by the brand, not by the picture's own alt", async () => {
    const withAlt: BrandLogo = { image: { product: "kettle", index: 0, alt: { ru: "Знак" } }, name: { ru: "Kilnhouse" }, href: null }
    const html = (await render(props([withAlt, logo("pan", "Ольха")])))!
    expect(html).toContain('alt="Kilnhouse"')
    expect(html).not.toContain('alt="Знак"')
  })

  it("makes a logo with href a link named by the brand, with a 44px target and the ring; one without, a picture", async () => {
    const html = (await render(
      props([logo("kettle", "Kilnhouse", "/categories/kilnhouse"), logo("pan", "Ольха", "https://olkha.example/"), logo("mug", "Brightpan")])
    ))!
    const [inShop, outside, plain] = items(html)
    const link = inShop.match(/^<a href="\/ru\/categories\/kilnhouse"[^>]*>(.*)<\/a>$/)
    expect(link).not.toBeNull()
    // The link's name is the brand's: its only content is the picture, named by `alt`, with no other words.
    expect(link![1].replace(/<[^>]*>/g, "")).toBe("")
    expect(link![1]).toMatch(/<img[^>]* alt="Kilnhouse"/)
    expect(inShop).toContain("min-h-11")
    expect(inShop).toContain("focus-visible:outline-[var(--ring)]")
    expect(outside).toMatch(/^<a href="https:\/\/olkha\.example\/"/)
    expect(outside).toMatch(/<img[^>]* alt="Ольха"/)
    expect(plain).not.toContain("<a ")
    expect(plain).toMatch(/<img[^>]* alt="Brightpan"/)
  })

  it("sets every logo in a hard box of one ratio, contained in its middle two thirds across and half down", async () => {
    const html = (await render(props([logo("kettle", "Kilnhouse"), logo("pan", "Ольха")])))!
    for (const body of items(html)) {
      expect(body).toMatch(/class="group flex aspect-\[3\/2\] w-full items-center justify-center[ "]/)
      expect(body).toMatch(/<div data-role="media" class="relative h-1\/2 w-2\/3"><img[^>]* data-fill=""[^>]* class="object-contain"/)
    }
  })

  it("puts each logo on a card in `cards` and on the page in `plain`", async () => {
    const two = [logo("kettle", "Kilnhouse"), logo("pan", "Ольха")]
    const cards = (await render(props(two, { style: "cards" })))!
    expect(items(cards)[0]).toContain("bg-[var(--secondary)]")
    expect(items(cards)[0]).toContain("rounded-[var(--radius)]")
    const plain = (await render(props(two, { style: "plain" })))!
    expect(items(plain)[0]).not.toContain("bg-[")
  })

  it("lays two columns below 720px, three from 720px and the template's three to six from 1024px", async () => {
    const two = [logo("kettle", "Kilnhouse"), logo("pan", "Ольха")]
    for (const columns of [3, 4, 5, 6] as const) {
      const html = (await render(props(two, { columns })))!
      expect(html).toMatch(new RegExp(`<ul class="grid grid-cols-2 [^"]*min-\\[720px\\]:grid-cols-3 small:grid-cols-${columns}[ "]`))
    }
  })

  it("draws the logos in one tone with `monochrome`, colour on hover and focus, no transition under reduced motion", async () => {
    const two = [logo("kettle", "Kilnhouse", "/categories/kilnhouse"), logo("pan", "Ольха")]
    const mono = items((await render(props(two, { monochrome: true })))!)
    for (const body of mono) {
      expect(body).toMatch(/data-role="media" class="[^"]*\bgrayscale\b/)
      expect(body).toContain("group-hover:grayscale-0")
      expect(body).toContain("group-focus-visible:grayscale-0")
      expect(body).toContain("motion-reduce:transition-none")
    }
    const colour = items((await render(props(two, { monochrome: false })))!)
    for (const body of colour) expect(body).not.toContain("grayscale")
  })

  it("draws the shell's header above the list", async () => {
    const html = (await render(
      props([logo("kettle", "Kilnhouse"), logo("pan", "Ольха")], {
        header: { eyebrow: {}, heading: { ru: "Бренды в нашем магазине" }, description: {}, seeAll: null },
      })
    ))!
    expect(html).toMatch(/<header data-role="section-header"[^>]*>.*<h2 data-role="heading"[^>]*>Бренды в нашем магазине<\/h2>/)
  })

  it("draws nothing with fewer than two logos the shop has a picture for", async () => {
    expect(await render(props([]))).toBeNull()
    expect(await render(props([logo("kettle", "Kilnhouse"), logo("no-such-brand", "Ольха")]))).toBeNull()
    expect(await render(props([logo("kettle", "Kilnhouse"), logo("pan", "Ольха"), logo("no-such-brand", "Brightpan")]))).not.toBeNull()
    expect(await render(brands.fixtures!.empty)).toBeNull()
  })

  it("picks the visitor's language for the name", async () => {
    state.locale = "en"
    const twoLanguages: BrandLogo = { image: { product: "pan", index: 0, alt: {} }, name: { ru: "Ольха", en: "Olkha" }, href: null }
    const html = (await render(props([logo("kettle", "Kilnhouse"), twoLanguages])))!
    expect(html).toContain('alt="Olkha"')
  })
})

describe("logos/brands in the registry", () => {
  it("is the category logos, lab, static, with the roles it draws", () => {
    expect(blockById("logos/brands")).toBe(brands)
    expect(CATEGORY_BLOCKS.logos.map((block) => block.id)).toContain("logos/brands")
    expect(BLOCKS).toContain(brands)
    expect(brands).toMatchObject({ category: "logos", variant: "brands", status: "lab", placement: "home", data: ["static"] })
    expect([...brands.roles].sort()).toEqual(["logo", "media", "section-header"])
  })

  it("samples six made-up brands, each a picture drawn here: an SVG and its PNG under public/templates", () => {
    const sample = brands.fixtures!.sample
    expect(sample.logos).toHaveLength(6)
    expect(new Set(sample.logos.map((item) => item.name.ru)).size).toBe(6)
    for (const item of sample.logos) {
      expect("src" in item.image, item.name.ru).toBe(true)
      const src = (item.image as { src: string }).src
      expect(src).toMatch(/^\/templates\/sample-brands\/[a-z0-9-]+\.png$/)
      const png = fileURLToPath(new URL(`../../../../../public${src}`, import.meta.url))
      expect(existsSync(png), png).toBe(true)
      expect(existsSync(png.replace(/\.png$/, ".svg")), png).toBe(true)
    }
  })
})
