import type { HttpTypes } from "@medusajs/types"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getTemplate } from "@lib/templates/catalog"
import { validateTemplate } from "@lib/templates/manifest"

import { blockById, CATEGORY_BLOCKS } from "../../registry"
import { SEE_ALL_LABEL } from "../../shared/section-header"
import FeaturedCollection from "."
import { featured } from "./block"
import {
  NEWEST_HEADING,
  NEXT_LABEL,
  PREVIOUS_LABEL,
  parseFeaturedCollectionProps,
  type FeaturedCollectionProps,
} from "./props"
import { readSelection } from "./selection"

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

const data = vi.hoisted(() => ({
  getHomeRegion: vi.fn(),
  listCategories: vi.fn(),
  getCollectionByHandle: vi.fn(),
  listProducts: vi.fn(),
}))
vi.mock("@lib/data/home", () => ({ getHomeRegion: data.getHomeRegion }))
vi.mock("@lib/data/categories", () => ({ listCategories: data.listCategories }))
vi.mock("@lib/data/collections", () => ({ getCollectionByHandle: data.getCollectionByHandle }))
vi.mock("@lib/data/products", () => ({ listProducts: data.listProducts }))

// The storefront's own card; what it draws is its own test's business. The registry's
// listing variants read the grid constants beside it, so only the card is replaced.
vi.mock("@modules/products/components/product-card", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: ({ product }: { product: HttpTypes.StoreProduct }) => (
    <a data-testid="product-wrapper" href={`/products/${product.handle}`}>
      {product.title}
    </a>
  ),
}))

const product = (handle: string, thumbnail: string | null = `https://shipshift.dev/static/${handle}.webp`) =>
  ({ id: `prod_${handle}`, handle, title: handle, thumbnail }) as HttpTypes.StoreProduct

const shelf = (count: number) => Array.from({ length: count }, (_, index) => product(`item-${index}`))

/** The shop's flat category list as `listCategories()` answers it: a parent and its two leaves. */
const CATEGORIES = [
  { id: "pcat_kitchen", handle: "the-kitchen", name: "Кухня", category_children: [{ id: "pcat_cookware" }, { id: "pcat_tableware" }] },
  { id: "pcat_cookware", handle: "cookware", name: "Посуда для готовки", category_children: [] },
  { id: "pcat_tableware", handle: "tableware", name: "Сервировка", category_children: [] },
]

const answer = (products: HttpTypes.StoreProduct[]) => ({ response: { products, count: products.length }, nextPage: null })

const blank = parseFeaturedCollectionProps(undefined)
if (!blank.ok) throw new Error("absent props must parse")
const props = (over: Partial<FeaturedCollectionProps> = {}): FeaturedCollectionProps => ({ ...blank.value, ...over })

const render = async (value: FeaturedCollectionProps) => {
  const tree = await FeaturedCollection(value)
  return tree === null ? null : renderToStaticMarkup(tree)
}

/** The class lists of the cards, in order. */
const cardClasses = (html: string) => Array.from(html.matchAll(/<li data-role="product-card" class="([^"]*)"/g), (m) => m[1])

beforeEach(() => {
  locale.current = "ru"
  data.getHomeRegion.mockReset().mockResolvedValue({ id: "reg_ru", currency_code: "rub" })
  data.listCategories.mockReset().mockResolvedValue(CATEGORIES)
  data.getCollectionByHandle.mockReset().mockResolvedValue({ id: "pcol_morning", handle: "the-morning-table", title: "Утренний стол" })
  data.listProducts.mockReset().mockResolvedValue(answer(shelf(8)))
})

describe("parseFeaturedCollectionProps", () => {
  it("reads absent props as the newest eight of the catalogue, a grid of four, no header", () => {
    expect(blank.ok && blank.value).toEqual({
      header: null,
      source: { sort: "newest" },
      limit: 8,
      layout: "grid",
      columns: 4,
      previousLabel: PREVIOUS_LABEL,
      nextLabel: NEXT_LABEL,
    })
    expect(NEWEST_HEADING.ru && NEWEST_HEADING.en && PREVIOUS_LABEL.en && NEXT_LABEL.ru).toBeTruthy()
  })

  it("takes a category, a collection or the newest sort as the source", () => {
    for (const source of [{ category: "the-kitchen" }, { collection: "the-morning-table" }, { sort: "newest" }]) {
      const result = parseFeaturedCollectionProps({ source, limit: 12, layout: "carousel", columns: 5 })
      expect(result.ok && result.value).toMatchObject({ source, limit: 12, layout: "carousel", columns: 5 })
    }
  })

  it("refuses bad props with the path of every field, bestsellers included", () => {
    const result = parseFeaturedCollectionProps({
      source: { sort: "bestsellers" },
      limit: 3,
      columns: 6,
      layout: "masonry",
      nextLabel: { ru: "я".repeat(31) },
      rows: 2,
    })
    expect(result.ok ? [] : result.errors).toEqual([
      "source.sort must be one of: newest",
      "limit must be a whole number from 4 to 12",
      "layout must be one of: grid, carousel",
      "columns must be a whole number from 3 to 5",
      "nextLabel.ru is 31 characters, at most 30",
      "rows: not a prop of collection/featured",
    ])
  })

  it("refuses a source naming two kinds or none, and a handle that is not one", () => {
    const errors = (source: unknown) => {
      const result = parseFeaturedCollectionProps({ source })
      return result.ok ? [] : result.errors
    }
    expect(errors({ category: "cookware", sort: "newest" })).toEqual(["source must name exactly one of: category, collection, sort"])
    expect(errors({ tag: "sale" })).toEqual(["source must name exactly one of: category, collection, sort"])
    expect(errors({ category: "Bad Handle" })).toEqual(["source.category must be a handle of the shop (letters, digits, - and _)"])
    expect(errors({ collection: "летний-чай" })).toEqual([])
  })
})

describe("readSelection", () => {
  it("reads a category's whole branch, priced for the visitor's region, up to the limit", async () => {
    const selection = await readSelection({ category: "the-kitchen" }, 6)
    expect(data.listProducts).toHaveBeenCalledWith({
      regionId: "reg_ru",
      queryParams: { limit: 6, category_id: ["pcat_kitchen", "pcat_cookware", "pcat_tableware"] },
    })
    expect(selection).toMatchObject({ title: "Кухня", href: "/categories/the-kitchen" })
  })

  it("reads a collection by its handle, and the newest of the catalogue in /store's own order", async () => {
    expect(await readSelection({ collection: "the-morning-table" }, 4)).toMatchObject({
      title: "Утренний стол",
      href: "/collections/the-morning-table",
    })
    expect(data.listProducts).toHaveBeenLastCalledWith({ regionId: "reg_ru", queryParams: { limit: 4, collection_id: ["pcol_morning"] } })

    expect(await readSelection({ sort: "newest" }, 8)).toMatchObject({ title: null, href: "/store?sortBy=created_at" })
    expect(data.listProducts).toHaveBeenLastCalledWith({ regionId: "reg_ru", queryParams: { limit: 8, order: "-created_at" } })
  })

  it("answers null for a handle the shop does not have, an empty source and a visitor with no region", async () => {
    expect(await readSelection({ category: "another-shops-category" }, 8)).toBeNull()
    data.getCollectionByHandle.mockResolvedValueOnce(null)
    expect(await readSelection({ collection: "gone" }, 8)).toBeNull()
    data.listProducts.mockResolvedValueOnce(answer([]))
    expect(await readSelection({ sort: "newest" }, 8)).toBeNull()
    data.getHomeRegion.mockResolvedValueOnce(null)
    expect(await readSelection({ sort: "newest" }, 8)).toBeNull()
    expect(data.listProducts).toHaveBeenCalledTimes(1)
  })

  it("prefers the products with a picture while at least four have one", async () => {
    data.listProducts.mockResolvedValueOnce(answer([...shelf(4), product("bare", null)]))
    expect((await readSelection({ sort: "newest" }, 8))?.products.map((p) => p.handle)).not.toContain("bare")
    data.listProducts.mockResolvedValueOnce(answer([...shelf(3), product("bare", null)]))
    expect((await readSelection({ sort: "newest" }, 8))?.products.map((p) => p.handle)).toContain("bare")
  })
})

describe("FeaturedCollection", () => {
  it("draws nothing for a source with no product, and nothing on a failed read", async () => {
    data.listProducts.mockResolvedValueOnce(answer([]))
    expect(await render(props())).toBeNull()

    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    data.listProducts.mockRejectedValueOnce(new Error("socket hang up"))
    expect(await render(props())).toBeNull()
    expect(log.mock.calls[0][0]).toBe('collection/featured: could not read {"sort":"newest"}')
    log.mockRestore()
  })

  it("heads the section with the category's name and links «see all» to it", async () => {
    const html = (await render(props({ source: { category: "the-kitchen" } })))!
    expect(html).toContain('data-block="collection/featured"')
    expect(html).toMatch(/<h2 data-role="heading"[^>]*>Кухня<\/h2>/)
    expect(html).toContain(`<a href="/ru/categories/the-kitchen" data-role="cta-secondary"`)
    expect(html).toContain(`>${SEE_ALL_LABEL.ru}</a>`)
    expect(html.match(/data-testid="product-wrapper"/g)).toHaveLength(8)
  })

  it("keeps the template's own heading and link, and names the newest in the visitor's language", async () => {
    const own = (await render(
      props({
        header: {
          eyebrow: {},
          heading: { ru: "К завтраку", en: "For breakfast" },
          description: {},
          seeAll: { href: "/store", label: { ru: "В каталог" } },
        },
        source: { category: "the-kitchen" },
      })
    ))!
    expect(own).toMatch(/<h2 data-role="heading"[^>]*>К завтраку<\/h2>/)
    expect(own).toContain('<a href="/ru/store" data-role="cta-secondary"')

    locale.current = "en"
    const newest = (await render(props()))!
    expect(newest).toMatch(/<h2 data-role="heading"[^>]*>New arrivals<\/h2>/)
    expect(newest).toContain('href="/ru/store?sortBy=created_at"')
  })

  it("lays a grid of whole rows only: 2 on a phone, 3 from 720 px, `columns` from 1024 px", async () => {
    data.listProducts.mockResolvedValueOnce(answer(shelf(7)))
    const html = (await render(props({ columns: 4 })))!
    expect(html).toMatch(/<ul class="grid grid-cols-2 [^"]*min-\[720px\]:grid-cols-3 [^"]*small:grid-cols-4 /)
    // Seven cards: six on a phone and from 720 px (rows of two and three), four from 1024 px.
    expect(cardClasses(html)).toEqual([
      "min-w-0",
      "min-w-0",
      "min-w-0",
      "min-w-0",
      "min-w-0 small:hidden",
      "min-w-0 small:hidden",
      "min-w-0 hidden",
    ])

    data.listProducts.mockResolvedValueOnce(answer(shelf(5)))
    const five = (await render(props({ columns: 5 })))!
    expect(five).toContain("small:grid-cols-5")
    // Five cards: four on a phone, three from 720 px, all five from 1024 px.
    expect(cardClasses(five).slice(3)).toEqual(["min-w-0 min-[720px]:hidden small:block", "min-w-0 hidden small:block"])
  })

  it("lays a carousel of `columns` cards from 1024 px, with arrows and a fading edge when there are more cards", async () => {
    const html = (await render(props({ layout: "carousel", columns: 3 })))!
    expect(html).toMatch(/<ul id="[^"]+" class="[^"]*snap-x snap-mandatory[^"]* max-small:\[mask-image:linear-gradient\(to_var\(--fade-side,right\)/)
    expect(cardClasses(html)[0]).toBe("min-w-0 w-[42%] shrink-0 snap-start min-[720px]:w-[30%] small:w-[calc((100%-3rem)/3)]")
    expect(html).toMatch(/<button type="button" aria-label="Назад" aria-controls="[^"]+" disabled=""/)
    expect(html).toMatch(/<button type="button" aria-label="Вперёд" aria-controls="[^"]+" class=/)

    data.listProducts.mockResolvedValueOnce(answer(shelf(4)))
    const fits = (await render(props({ layout: "carousel", columns: 4 })))!
    expect(fits).not.toContain("<button")
    expect(fits).not.toContain("mask-image")
  })

  it("hands the template's photo layer to the storefront's card frame", async () => {
    for (const layout of ["grid", "carousel"] as const) {
      const html = (await render(props({ layout })))!
      expect(html).toContain("[--product-media-ratio:var(--layer-photo-aspect,3/4)]")
    }
  })
})

describe("the registry entry", () => {
  it("is a lab home block of the collection category with the roles of R1's build list", () => {
    expect(blockById("collection/featured")).toBe(featured)
    expect(featured).toMatchObject({
      category: "collection",
      variant: "featured",
      data: ["products", "categories"],
      status: "lab",
      placement: "home",
    })
    expect([...featured.roles].sort()).toEqual(["badge", "cta-secondary", "price", "product-card", "section-header"])
    expect(CATEGORY_BLOCKS.collection.map((b) => b.id)).toContain("collection/featured")
  })

  it("may stand in a template any number of times, and a template's bad source is refused with its path", () => {
    const manifest = structuredClone(getTemplate("long-morning")!.manifest)
    const sample = featured.fixtures!.sample
    manifest.sections.push({ block: "collection/featured", props: sample })
    manifest.sections.push({ block: "collection/featured", props: { source: { sort: "newest" }, layout: "grid", columns: 3 } })
    const result = validateTemplate(manifest, blockById)
    expect(result.ok ? [] : result.errors).toEqual([])

    manifest.sections[manifest.sections.length - 1] = { block: "collection/featured", props: { source: { sort: "bestsellers" } } }
    const refused = validateTemplate(manifest, blockById)
    expect(refused.ok ? [] : refused.errors.map((e) => e.message)).toEqual(["source.sort must be one of: newest"])
  })
})
