import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getTemplate } from "@lib/templates/catalog"
import { validateTemplate } from "@lib/templates/manifest"

import { BLOCKS, CATEGORY_BLOCKS, blockById } from "../../registry"
import type { ImageRef } from "../../shared/image-ref"
import { SECTION_TYPE } from "../../shared/section-type"
import PromoGrid, { tileSpans } from "."
import { grid } from "./block"
import { BUTTON_LABEL, parsePromoGridProps, type PromoGridProps, type PromoTile } from "./props"

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
    return url ? { url, alt: ref.alt.ru ?? key, width: null, height: null } : null
  },
}))
vi.mock("next/image", () => ({
  default: ({ src, alt, fill, sizes, className }: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src as string}
      alt={alt as string}
      loading="lazy"
      data-fill={fill ? "" : undefined}
      sizes={sizes as string}
      className={className as string}
    />
  ),
}))

const render = async (props: PromoGridProps) => {
  const tree = await PromoGrid(props)
  return tree === null ? null : renderToStaticMarkup(tree)
}

const tile = (handle: string, heading: string, extra: Partial<PromoTile> = {}): PromoTile => ({
  image: { product: handle, index: 0, alt: {} },
  badge: {},
  heading: { ru: heading },
  text: {},
  button: null,
  ...extra,
})

const blank: PromoGridProps = { tiles: [], layout: "equal", textPosition: "overlay", gap: "normal" }

const errors = (input: unknown) => {
  const result = parsePromoGridProps(input)
  return result.ok ? [] : result.errors
}

/** Each `<li>` of the grid: its class list and its inner markup. */
const cards = (html: string) =>
  Array.from(html.matchAll(/<li data-role="card" class="([^"]*)">(.*?)<\/li>/g), (m) => ({ cls: m[1].split(" "), body: m[2] }))

beforeEach(() => {
  state.locale = "ru"
  state.pictures = {
    braiser: "https://cdn.test/braiser.webp",
    mug: "https://cdn.test/mug.webp",
    "candle-holder": "https://cdn.test/candle.webp",
    tableware: "https://cdn.test/plates.webp",
    "kitchen-textiles": "https://cdn.test/towels.webp",
  }
  state.calls = []
})

describe("parsePromoGridProps", () => {
  it("reads absent props as no tiles, equal, words over the picture, the normal gap", () => {
    expect(parsePromoGridProps(undefined)).toEqual({ ok: true, value: blank })
  })

  it("gives a button without a label the block's own Russian and English words", () => {
    const result = parsePromoGridProps({
      tiles: [
        { image: { product: "braiser" }, heading: { ru: "Чугун" }, button: { href: "/store" } },
        { image: { category: "tableware" }, heading: { ru: "Тарелки" } },
      ],
    })
    expect(result.ok && result.value.tiles).toEqual([
      { image: { product: "braiser", index: 0, alt: {} }, badge: {}, heading: { ru: "Чугун" }, text: {}, button: { href: "/store", label: BUTTON_LABEL } },
      { image: { category: "tableware", alt: {} }, badge: {}, heading: { ru: "Тарелки" }, text: {}, button: null },
    ])
    expect(BUTTON_LABEL.ru && BUTTON_LABEL.en).toBeTruthy()
  })

  it("holds two to six tiles", () => {
    const one = { image: { product: "braiser" }, heading: { ru: "Чугун" } }
    expect(errors({ tiles: [one] })).toEqual(["tiles has 1 items, at least 2"])
    expect(errors({ tiles: Array(7).fill(one) })).toEqual(["tiles has 7 items, at most 6"])
    expect(errors({ tiles: Array(6).fill(one) })).toEqual([])
  })

  it("refuses bad props with the path of every field", () => {
    expect(
      errors({
        tiles: [
          { heading: { ru: "я".repeat(61) }, badge: { ru: "я".repeat(25) }, text: { xx: "Hello" } },
          {
            image: { src: "https://cdn.example/a.jpg" },
            button: { label: { ru: "я".repeat(31) }, href: "//evil.example" },
            price: 100,
          },
        ],
        layout: "mosaic",
        textPosition: "top",
        gap: "wide",
        header: {},
      })
    ).toEqual([
      "tiles[0].image is required",
      "tiles[0].badge.ru is 25 characters, at most 24",
      "tiles[0].heading.ru is 61 characters, at most 60",
      "tiles[0].text.xx: not a language of i18n/config.ts",
      "tiles[1].image.src must be /templates/<template-id>/<file>.(avif|webp|jpg|png)",
      "tiles[1].button.label.ru is 31 characters, at most 30",
      "tiles[1].button.href: // leads to another site; write https://",
      "tiles[1].price: not a field of tiles[1]",
      "layout must be one of: equal, feature",
      "textPosition must be one of: overlay, below",
      "gap must be one of: tight, normal",
      "header: not a prop of promo/grid",
    ])
  })
})

describe("tileSpans", () => {
  it("lays equal tiles in rows of two or three from 1024 px, two columns from 512 px with an odd last tile across", () => {
    const small = (n: number) => tileSpans(n, "equal").map((s) => s.small)
    expect([1, 2, 3, 4, 5, 6].map(small)).toEqual([
      [6],
      [3, 3],
      [2, 2, 2],
      [3, 3, 3, 3],
      [3, 3, 2, 2, 2],
      [2, 2, 2, 2, 2, 2],
    ])
    expect(tileSpans(3, "equal").map((s) => s.xsmall)).toEqual([1, 1, 2])
    expect(tileSpans(4, "equal").map((s) => s.xsmall)).toEqual([1, 1, 1, 1])
  })

  it("makes the first tile twice as wide as its neighbour under feature, the rest in equal rows", () => {
    const small = (n: number) => tileSpans(n, "feature").map((s) => s.small)
    expect([1, 2, 3, 4, 5, 6].map(small)).toEqual([[6], [4, 2], [4, 2, 6], [4, 2, 3, 3], [4, 2, 2, 2, 2], [4, 2, 3, 3, 3, 3]])
    expect(tileSpans(5, "feature").map((s) => s.xsmall)).toEqual([2, 1, 1, 1, 1])
    expect(tileSpans(4, "feature").map((s) => s.xsmall)).toEqual([2, 1, 1, 2])
  })

  it("fills every row of six columns: no hole is left at the end", () => {
    for (const layout of ["equal", "feature"] as const) {
      for (let n = 1; n <= 6; n += 1) {
        const spans = tileSpans(n, layout)
        expect(spans.reduce((sum, s) => sum + s.small, 0) % 6).toBe(0)
        expect(spans.reduce((sum, s) => sum + s.xsmall, 0) % 2).toBe(0)
      }
    }
  })
})

describe("PromoGrid", () => {
  it("draws nothing with no tile, and reads no picture for a tile without a heading", async () => {
    expect(await render(blank)).toBeNull()
    expect(await render(grid.fixtures!.empty)).toBeNull()
    expect(state.calls).toEqual([])
  })

  it("drops a tile without a heading and a tile whose picture the shop does not have; none left draws nothing", async () => {
    const html = (await render({
      ...blank,
      tiles: [tile("braiser", "Чугун"), tile("mug", "  "), tile("gone", "Нет такого товара"), tile("candle-holder", "Подарок")],
    }))!
    expect(cards(html).map((c) => c.body.match(/<h3[^>]*>([^<]+)<\/h3>/)?.[1])).toEqual(["Чугун", "Подарок"])
    expect(state.calls).toHaveLength(3)

    state.pictures = {}
    expect(await render({ ...blank, tiles: [tile("braiser", "Чугун"), tile("mug", "Кружки")] })).toBeNull()
  })

  it("draws the sample in its section shell: a card per tile with its picture, badge, heading, text and button", async () => {
    const html = (await render(grid.fixtures!.sample))!
    expect(html).toMatch(/^<section data-block="promo\/grid" class="py-\[calc\(var\(--layer-section-gap,3rem\)\/2\)\]">/)
    expect(html).toContain('<div class="content-container">')
    expect(html).not.toContain('data-role="section-header"')
    const list = cards(html)
    expect(list).toHaveLength(5)
    for (const { body } of list) {
      expect(body).toMatch(/<div data-role="card-image"[^>]*><img src="https:\/\/cdn\.test\/[^"]+" alt="[^"]*" loading="lazy" data-fill=""/)
      expect(body).toMatch(/<span data-role="badge"[^>]*>[^<]+<\/span>/)
      expect(body).toMatch(/<h3 data-role="headline"[^>]*>[^<]+<\/h3>/)
      expect(body).toMatch(/<a href="\/ru\/[^"]+" data-role="cta-primary"/)
    }
    expect(list[0].body).toContain(">−20\u00a0%</span>")
    expect(list[0].body).toContain('<p data-role="description"')
    expect(list[0].body).toContain('href="/ru/categories/cookware"')
    expect(list[4].body).toContain("Подсвечник к заказу от 5 000 ₽")
  })

  it("spans the tiles on a grid of one, two and six columns", async () => {
    const html = (await render(grid.fixtures!.sample))!
    expect(html).toContain('<ul class="grid grid-cols-1 xsmall:grid-cols-2 small:grid-cols-6')
    expect(cards(html).map((c) => c.cls.filter((k) => /col-span/.test(k)))).toEqual([
      ["xsmall:col-span-2", "small:col-span-4"],
      ["xsmall:col-span-1", "small:col-span-2"],
      ["xsmall:col-span-1", "small:col-span-2"],
      ["xsmall:col-span-1", "small:col-span-2"],
      ["xsmall:col-span-1", "small:col-span-2"],
    ])
    const sizes = Array.from(html.matchAll(/sizes="([^"]+)"/g), (m) => m[1])
    expect(sizes[0]).toBe("(min-width: 1024px) 67vw, (min-width: 512px) 100vw, 100vw")
    expect(sizes[1]).toBe("(min-width: 1024px) 33vw, (min-width: 512px) 50vw, 100vw")
  })

  it("keeps the words over the picture on a --background panel in --foreground, never on black", async () => {
    const html = (await render({ ...blank, tiles: [tile("braiser", "Чугун", { text: { ru: "Жаровни" } }), tile("mug", "Кружки")] }))!
    const [first] = cards(html)
    expect(first.cls).toEqual(expect.arrayContaining(["relative", "overflow-hidden", "rounded-[var(--radius)]", "min-h-[calc(24rem*var(--layer-density,1))]"]))
    expect(first.body).toMatch(/<div data-role="card-image" class="absolute inset-0">/)
    // The picture keeps its own room above the panel.
    expect(first.body).toContain('<div aria-hidden="true" class="min-h-[calc(9rem*var(--layer-density,1))] flex-1"></div><div class=')
    const panel = first.body.match(/<div class="([^"]*)"><div class="flex flex-1 flex-col items-start gap-2"><h3/)![1].split(" ")
    expect(panel).toEqual(expect.arrayContaining(["relative", "bg-[var(--background)]", "rounded-[var(--radius)]"]))
    expect(first.body).toContain(`<p data-role="description" class="${SECTION_TYPE.description}">Жаровни</p>`)
    expect(html).not.toMatch(/bg-black|from-black|#000|rgba?\(0/)
  })

  it("puts the words under the picture when asked, the picture in a box of its own height", async () => {
    const html = (await render({ ...blank, textPosition: "below", tiles: [tile("braiser", "Чугун"), tile("mug", "Кружки")] }))!
    const [first] = cards(html)
    expect(first.cls).not.toContain("relative")
    expect(first.body).not.toContain('aria-hidden="true"')
    expect(first.body).toMatch(
      /<div data-role="card-image" class="relative h-\[calc\(14rem\*var\(--layer-density,1\)\)\] overflow-hidden rounded-\[var\(--radius\)\] bg-\[var\(--muted\)\] small:h-\[calc\(18rem\*var\(--layer-density,1\)\)\]">/
    )
    expect(first.body).not.toContain("bg-[var(--background)]")
  })

  it("draws a badge only where the tile has one, and a button only where it has a link with words", async () => {
    const html = (await render({
      ...blank,
      tiles: [
        tile("braiser", "Чугун", { badge: { ru: "−20 %" }, button: { label: BUTTON_LABEL, href: "https://example.ru/sale" } }),
        tile("mug", "Кружки", { button: { label: {}, href: "/store" } }),
      ],
    }))!
    const [first, second] = cards(html)
    expect(first.body).toContain('data-role="badge"')
    expect(first.body).toMatch(/<a data-role="cta-primary" href="https:\/\/example\.ru\/sale"[^>]*>Смотреть<\/a>/)
    expect(second.body).not.toContain('data-role="badge"')
    expect(second.body).not.toContain("<a ")
  })

  it("draws the button in the template's button layer, 44 px high, with a focus ring", async () => {
    const html = (await render({ ...blank, tiles: [tile("braiser", "Чугун", { button: { label: BUTTON_LABEL, href: "/store" } }), tile("mug", "Кружки")] }))!
    const button = html.match(/<a href="\/ru\/store" data-role="cta-primary" class="([^"]*)"/)![1].split(" ")
    expect(button).toEqual(
      expect.arrayContaining([
        "min-h-11",
        "rounded-[var(--radius)]",
        "bg-[var(--layer-button-bg,var(--primary))]",
        "text-[var(--layer-button-fg,var(--primary-foreground))]",
        "border-[var(--layer-button-border,var(--primary))]",
        "focus-visible:outline-[var(--ring)]",
        "motion-reduce:transition-none",
      ])
    )
  })

  it("sets the gap tight or normal, on the template's space steps, with more room between rows when the words stand under the picture", async () => {
    const two = [tile("braiser", "Чугун"), tile("mug", "Кружки")]
    expect(await render({ ...blank, tiles: two })).toContain(
      '<ul class="grid grid-cols-1 xsmall:grid-cols-2 small:grid-cols-6 gap-[var(--layer-space-4,1rem)] small:gap-[var(--layer-space-6,1.5rem)]">'
    )
    expect(await render({ ...blank, gap: "tight", tiles: two })).toMatch(/<ul class="[^"]*\bgap-2"/)
    expect(await render({ ...blank, textPosition: "below", tiles: two })).toMatch(
      /<ul class="[^"]*\bgap-x-\[var\(--layer-space-4,1rem\)\] gap-y-\[var\(--layer-space-8,2rem\)\] small:gap-x-\[var\(--layer-space-6,1\.5rem\)\]"/
    )
    expect(await render({ ...blank, textPosition: "below", gap: "tight", tiles: two })).toMatch(/<ul class="[^"]*\bgap-x-2 gap-y-6"/)
  })

  it("uses tokens only and keeps the text plain: markup in the props is shown, not run", async () => {
    const html = (await render({
      ...blank,
      tiles: [tile("braiser", "<b>Чугун</b>", { text: { ru: "<script>alert(1)</script>" } }), tile("mug", "Кружки")],
    }))!
    expect(html).not.toContain("<b>")
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;b&gt;Чугун&lt;/b&gt;")
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|oklch\(|shadow-\[/i)
  })

  it("picks the visitor's language, then English", async () => {
    state.locale = "de"
    const html = (await render({ ...blank, tiles: [tile("braiser", "Чугун", { heading: { ru: "Чугун", en: "Cast iron" } }), tile("mug", "Кружки", { heading: { en: "Mugs" } })] }))!
    expect(cards(html).map((c) => c.body.match(/<h3[^>]*>([^<]+)<\/h3>/)?.[1])).toEqual(["Cast iron", "Mugs"])
  })
})

describe("promo/grid in the registry", () => {
  it("is a lab home block with the roles it draws", () => {
    expect(blockById("promo/grid")).toBe(grid)
    expect(grid).toMatchObject({ category: "promo", variant: "grid", data: ["products", "categories", "static"], status: "lab", placement: "home" })
    expect([...grid.roles].sort()).toEqual(["badge", "card", "card-image", "cta-primary", "description", "headline"])
    expect(CATEGORY_BLOCKS.promo.map((b) => b.id)).toContain("promo/grid")
    expect(BLOCKS.map((b) => b.id)).toContain("promo/grid")
  })

  it("may stand in a template, and a template with seven tiles is refused with its path", () => {
    const manifest = structuredClone(getTemplate("long-morning")!.manifest)
    manifest.sections.push({ block: "promo/grid", props: grid.fixtures!.sample })
    const result = validateTemplate(manifest, blockById)
    expect(result.ok ? [] : result.errors).toEqual([])

    const seven = Array(7).fill(grid.fixtures!.sample.tiles[0])
    manifest.sections[manifest.sections.length - 1] = { block: "promo/grid", props: { tiles: seven } }
    const refused = validateTemplate(manifest, blockById)
    expect(refused.ok ? [] : refused.errors.map((e) => e.message)).toEqual(["tiles has 7 items, at most 6"])
  })
})
