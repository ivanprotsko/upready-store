import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getTemplate } from "@lib/templates/catalog"
import { validateTemplate } from "@lib/templates/manifest"

import { blockById, CATEGORY_BLOCKS } from "../../registry"
import { SECTION_TYPE } from "../../shared/section-type"
import Mosaic from "."
import { mosaic } from "./block"
import { parseMosaicProps, type MosaicProps } from "./props"

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

const loaders = vi.hoisted(() => ({
  resolveImageRef: vi.fn(),
  listProducts: vi.fn(),
  getCategoryByHandle: vi.fn(),
}))
vi.mock("@lib/data/block-image", () => ({ resolveImageRef: loaders.resolveImageRef }))
vi.mock("@lib/data/products", () => ({ listProducts: loaders.listProducts }))
vi.mock("@lib/data/categories", () => ({ getCategoryByHandle: loaders.getCategoryByHandle }))
vi.mock("@lib/data/cookies", () => ({ getCountryCode: async () => "ru" }))

// The card itself is the storefront's; the registry still needs the module's grid classes.
vi.mock("@modules/products/components/product-card", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  default: ({ product }: { product: { handle: string; title: string } }) => (
    <a href={`/ru/products/${product.handle}`} data-testid="product-wrapper">
      {product.title}
    </a>
  ),
}))

vi.mock("next/image", () => ({
  default: ({ src, alt, fill, sizes, className }: { src: string; alt: string; fill?: boolean; sizes?: string; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element -- a stand-in for next/image in the test
    <img src={src} alt={alt} data-fill={fill ? "true" : "false"} sizes={sizes} className={className} />
  ),
}))

const render = async (props: MosaicProps) => {
  const tree = await Mosaic(props)
  return tree === null ? null : renderToStaticMarkup(tree)
}

const CATEGORIES: Record<string, { name: string; handle: string; metadata: Record<string, unknown> }> = {
  cookware: { name: "Посуда для готовки", handle: "cookware", metadata: { image_url: "https://shipshift.dev/static/cookware.webp" } },
  tableware: { name: "Сервировка", handle: "tableware", metadata: { image_url: "https://shipshift.dev/static/tableware.webp", image_alt: "Тарелки" } },
  "no-picture": { name: "Без картинки", handle: "no-picture", metadata: {} },
}

const tiles = {
  cookware: { category: "cookware" },
  tableware: { category: "tableware" },
  skillet: { product: "skillet" },
  picture: { image: { src: "/templates/long-morning/kitchen.webp", alt: { ru: "Кухня" } }, title: { ru: "Кухня" }, href: "/store" },
} as const

const props = (over: Partial<MosaicProps> = {}): MosaicProps => ({
  header: null,
  tiles: [tiles.cookware, tiles.skillet, tiles.tableware],
  largeSide: "left",
  mobile: "stack",
  ...over,
})

/** The opening tags of the tiles, in order. */
const tilesOf = (html: string) => html.match(/<li [^>]*>/g) ?? []
const classOf = (tag: string) => tag.match(/class="([^"]*)"/)?.[1] ?? ""

beforeEach(() => {
  locale.current = "ru"
  loaders.resolveImageRef.mockReset()
  loaders.resolveImageRef.mockImplementation(async (ref: { src?: string; alt?: { ru?: string } }) =>
    ref.src ? { url: ref.src, alt: ref.alt?.ru ?? "", width: null, height: null } : null
  )
  loaders.listProducts.mockReset()
  loaders.listProducts.mockImplementation(async ({ queryParams }: { queryParams: { handle: string } }) => ({
    response: {
      products: queryParams.handle === "skillet" ? [{ id: "prod_1", handle: "skillet", title: "Сковорода" }] : [],
      count: 0,
    },
    nextPage: null,
  }))
  loaders.getCategoryByHandle.mockReset()
  loaders.getCategoryByHandle.mockImplementation(async ([handle]: string[]) => CATEGORIES[handle])
})

describe("parseMosaicProps", () => {
  it("reads absent props as no tiles, the large tile left, stacked on a phone", () => {
    expect(parseMosaicProps(undefined)).toEqual({
      ok: true,
      value: { header: null, tiles: [], largeSide: "left", mobile: "stack" },
    })
  })

  it("reads each kind of tile: a picture with its caption and link, a product, a category", () => {
    const result = parseMosaicProps({
      tiles: [{ image: { category: "cookware" } }, { product: "skillet" }, { category: "tableware" }],
      largeSide: "right",
      mobile: "swipe",
    })
    expect(result).toEqual({
      ok: true,
      value: {
        header: null,
        tiles: [
          { image: { category: "cookware", alt: {} }, title: {}, href: null },
          { product: "skillet" },
          { category: "tableware" },
        ],
        largeSide: "right",
        mobile: "swipe",
      },
    })
  })

  it("refuses bad props with the path of every field", () => {
    const result = parseMosaicProps({
      tiles: [
        { product: "Bad Handle" },
        { product: "skillet", category: "cookware" },
        { category: "tableware", title: { ru: "Сервировка" } },
        { image: { src: "https://example.com/a.jpg" }, title: { ru: "я".repeat(61) }, href: "//evil.example" },
      ],
      largeSide: "center",
      mobile: "grid",
      layout: "overlap",
    })
    expect(result.ok ? [] : result.errors).toEqual([
      "tiles has 4 items, at most 3",
      "tiles[0].product must be a handle of the shop (letters, digits, - and _)",
      "tiles[1] must name exactly one of: image, product, category",
      "tiles[2].title: not a field of tiles[2]",
      "tiles[3].image.src must be /templates/<template-id>/<file>.(avif|webp|jpg|png)",
      "tiles[3].title.ru is 61 characters, at most 60",
      "tiles[3].href: // leads to another site; write https://",
      "largeSide must be one of: left, right",
      "mobile must be one of: stack, swipe",
      "layout: not a prop of collage/mosaic",
    ])
  })

  it("asks for exactly three tiles when a template gives any", () => {
    const result = parseMosaicProps({ tiles: [{ product: "skillet" }, { category: "cookware" }] })
    expect(result.ok ? [] : result.errors).toEqual(["tiles has 2 items, at least 3"])
    // An empty list is no tiles, as an absent one is: the empty fixture reads back.
    expect(parseMosaicProps({ tiles: [] })).toEqual(parseMosaicProps(undefined))
    expect(parseMosaicProps(mosaic.fixtures!.empty)).toEqual({ ok: true, value: mosaic.fixtures!.empty })
  })
})

describe("Mosaic", () => {
  it("draws nothing without tiles, and reads nothing", async () => {
    expect(await render(mosaic.fixtures!.empty)).toBeNull()
    expect(loaders.getCategoryByHandle).not.toHaveBeenCalled()
    expect(loaders.listProducts).not.toHaveBeenCalled()
    expect(loaders.resolveImageRef).not.toHaveBeenCalled()
  })

  it("draws nothing when fewer than two tiles resolve", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await render(props({ tiles: [{ category: "gone" }, { product: "gone" }, tiles.tableware] }))).toBeNull()
    expect(log).not.toHaveBeenCalled()
    loaders.getCategoryByHandle.mockRejectedValue(new Error("backend down"))
    loaders.listProducts.mockRejectedValue(new Error("backend down"))
    expect(await render(props())).toBeNull()
    log.mockRestore()
  })

  it("drops a tile whose read fails and names it in the log: a failure is not an empty source", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const failure = new Error("backend down")
    loaders.listProducts.mockRejectedValue(failure)
    const html = (await render(props()))!
    expect(tilesOf(html)).toHaveLength(2)
    expect(html).not.toContain('data-role="product-card"')
    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith('collage/mosaic: could not read product "skillet"', failure)
    log.mockRestore()
  })

  it("draws the sample in its shell: the header, one large category, the product's own card, a small category", async () => {
    const sample = mosaic.fixtures!.sample
    const html = (await render(sample))!
    expect(html.replace(/^(<link rel="preload"[^>]*\/>)+/, "")).toMatch(
      /^<section data-block="collage\/mosaic" class="py-\[calc\(var\(--layer-section-gap,3rem\)\/2\)\]">/
    )
    expect(html).toMatch(/<header data-role="section-header"[^>]*>.*<h2 data-role="heading" class="[^"]*">[^<]+<\/h2>/)
    expect(html).toContain(`<h2 data-role="heading" class="${SECTION_TYPE.heading}">`)
    expect(html.match(/<h2/g)).toHaveLength(1)

    expect(loaders.getCategoryByHandle).toHaveBeenCalledWith(["cookware"])
    expect(loaders.getCategoryByHandle).toHaveBeenCalledWith(["tableware"])
    expect(loaders.listProducts).toHaveBeenCalledWith({ countryCode: "ru", queryParams: { handle: "skillet", limit: 1 } })

    const [large, product, small] = tilesOf(html)
    expect(large).toContain('data-role="card"')
    expect(product).toContain('data-role="product-card"')
    expect(small).toContain('data-role="card"')
    expect(html).toMatch(
      /<a href="\/ru\/categories\/cookware"[^>]*>\s*<div data-role="card-image"[^>]*>.*?<img src="https:\/\/shipshift\.dev\/static\/cookware\.webp" alt="Посуда для готовки" data-fill="true"/
    )
    expect(html).toMatch(/<h3[^>]*>Посуда для готовки<svg[^>]*aria-hidden="true"/)
    expect(html).toContain('<a href="/ru/products/skillet" data-testid="product-wrapper">Сковорода</a>')
    expect(html).toMatch(/<img src="https:\/\/shipshift\.dev\/static\/tableware\.webp" alt="Тарелки"/)
  })

  it("makes the first tile large, two thirds of the row from 720 px, on the chosen side", async () => {
    const left = (await render(props()))!
    expect(left).toContain("min-[720px]:grid-cols-[2fr_1fr]")
    const [large, first, second] = tilesOf(left).map(classOf)
    expect(large).toContain("min-[720px]:row-span-2")
    expect(large).toContain("min-[720px]:col-start-1")
    expect(first).toContain("min-[720px]:col-start-2")
    expect(second).toContain("min-[720px]:col-start-2")
    expect(left).toContain('sizes="(min-width: 720px) 66vw, 100vw"')
    expect(left).toContain('sizes="(min-width: 720px) 33vw, 50vw"')

    const right = (await render(props({ largeSide: "right" })))!
    expect(right).toContain("min-[720px]:grid-cols-[1fr_2fr]")
    const [largeRight, ...smallRight] = tilesOf(right).map(classOf)
    expect(largeRight).toContain("min-[720px]:col-start-2")
    for (const tile of smallRight) expect(tile).toContain("min-[720px]:col-start-1")
  })

  it("drops a tile that does not resolve and lays the other two out equal", async () => {
    for (const missing of [{ category: "no-picture" }, { category: "gone" }, { product: "gone" }, { image: { product: "gone", index: 0, alt: {} }, title: {}, href: null }]) {
      const html = (await render(props({ tiles: [missing, tiles.skillet, tiles.tableware] })))!
      expect(tilesOf(html), JSON.stringify(missing)).toHaveLength(2)
      expect(html).toContain("min-[720px]:grid-cols-2")
      expect(html).not.toContain("row-span-2")
      expect(html).not.toContain("col-span-2")
      expect(html).not.toContain("grid-cols-[2fr_1fr]")
    }
  })

  it("stacks the large tile across a phone with the two small ones side by side, or lines them up to swipe", async () => {
    const stack = (await render(props()))!
    expect(stack).toMatch(/<ul class="[^"]*\bgrid grid-cols-2\b/)
    expect(classOf(tilesOf(stack)[0] ?? "")).toContain("col-span-2")
    expect(stack).not.toContain("overflow-x-auto")
    expect(stack).not.toContain("mask-image")

    const swipe = (await render(props({ mobile: "swipe" })))!
    expect(swipe).toMatch(/<ul class="[^"]*\bflex\b[^"]*\bsnap-x\b[^"]*\boverflow-x-auto\b[^"]*\bmin-\[720px\]:grid\b/)
    for (const tile of tilesOf(swipe).map(classOf)) {
      expect(tile).toContain("w-[80%]")
      expect(tile).toContain("shrink-0")
      expect(tile).toContain("snap-start")
      expect(tile).toContain("min-[720px]:w-auto")
      expect(tile).not.toMatch(/(^| )col-span-2/)
    }
    expect(swipe).toContain('sizes="(min-width: 720px) 66vw, 80vw"')
    // The row's edge fades, and only below 720 px, where it scrolls.
    expect(swipe).toContain("[mask-image:linear-gradient(to_right,black_calc(100%_-_1.5rem),transparent)]")
    expect(swipe).toContain("min-[720px]:[mask-image:none]")
  })

  it("draws a picture tile with its caption, as a link only when it has one", async () => {
    const linked = (await render(props({ tiles: [tiles.picture, tiles.skillet, tiles.tableware] })))!
    expect(loaders.resolveImageRef).toHaveBeenCalledWith(tiles.picture.image, "ru")
    expect(linked).toMatch(/<a href="\/ru\/store"[^>]*>\s*<div data-role="card-image"/)
    expect(linked).toMatch(/<h3[^>]*>Кухня<svg/)
    // 16 px, the size the product card's price already has, so no new pair on the type scale; an 8 px gap on the
    // space scale (QR-TYPE-SCALE, QR-SPACE-SCALE).
    expect(linked).toMatch(/<h3 class="[^"]*\bgap-x-2\b[^"]*\btext-base\b/)

    const still = (await render(props({ tiles: [{ ...tiles.picture, href: null }, tiles.skillet, tiles.tableware] })))!
    expect(still).not.toContain('href="/ru/store"')
    expect(still).toMatch(/<h3[^>]*>Кухня<\/h3>/)

    const bare = (await render(props({ tiles: [{ ...tiles.picture, title: {}, href: null }, tiles.skillet, tiles.tableware] })))!
    expect(bare.match(/<h3/g)).toHaveLength(1)
  })

  it("frames its own pictures by the photo layer and leaves the product card the shop's frame, tokens only", async () => {
    const html = (await render(props()))!
    expect(html).not.toContain("--product-media-ratio")
    expect(html).toContain("aspect-[var(--layer-photo-aspect,1/1)]")
    expect(html).toContain("rounded-[var(--radius)]")
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|oklch\(/i)
  })
})

describe("collage/mosaic in the registry", () => {
  it("is a lab home block that reads products and categories", () => {
    expect(blockById("collage/mosaic")).toBe(mosaic)
    expect(mosaic).toMatchObject({
      category: "collage",
      variant: "mosaic",
      data: ["products", "categories", "static"],
      status: "lab",
      placement: "home",
    })
    expect([...mosaic.roles].sort()).toEqual(["card", "card-image", "product-card", "section-header"])
    expect(CATEGORY_BLOCKS.collage.map((b) => b.id)).toContain("collage/mosaic")
  })

  it("stands in a template, and a template's bad props are refused with their path", () => {
    const manifest = structuredClone(getTemplate("long-morning")!.manifest)
    manifest.sections.splice(1, 0, { block: "collage/mosaic", props: mosaic.fixtures!.sample })
    const result = validateTemplate(manifest, blockById)
    expect(result.ok ? [] : result.errors).toEqual([])

    manifest.sections[1] = { block: "collage/mosaic", props: { tiles: [{ product: "skillet" }] } }
    const refused = validateTemplate(manifest, blockById)
    expect(refused.ok ? [] : refused.errors.map((e) => e.message)).toEqual(["tiles has 1 items, at least 3"])
  })
})
