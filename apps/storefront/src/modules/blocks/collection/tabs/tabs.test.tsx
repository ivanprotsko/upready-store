import type { HttpTypes } from "@medusajs/types"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getTemplate } from "@lib/templates/catalog"
import { validateTemplate } from "@lib/templates/manifest"

import { blockById, CATEGORY_BLOCKS } from "../../registry"
import { SEE_ALL_LABEL } from "../../shared/section-header"
import { NEWEST_HEADING, NEXT_LABEL, PREVIOUS_LABEL } from "../featured/props"
import CollectionTabs from "."
import { tabs as entry } from "./block"
import { loadTabCards } from "./load"
import { BESTSELLERS_LABEL, DEFAULT_TABS, parseCollectionTabsProps, type CollectionTabsProps } from "./props"
import { chooseTab, initialTabState, settleTab, tabAfterKey } from "./tab-state"

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

// The storefront's own card; what it draws is its own test's business.
vi.mock("@modules/products/components/product-card", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: ({ product }: { product: HttpTypes.StoreProduct }) => (
    <a data-testid="product-wrapper" href={`/products/${product.handle}`}>
      {product.title}
    </a>
  ),
}))

const shelf = (name: string, count: number) =>
  Array.from(
    { length: count },
    (_, index) =>
      ({
        id: `prod_${name}-${index}`,
        handle: `${name}-${index}`,
        title: `${name}-${index}`,
        thumbnail: `https://shipshift.dev/static/${name}-${index}.webp`,
      }) as HttpTypes.StoreProduct
  )

const CATEGORIES = [
  { id: "pcat_kitchen", handle: "the-kitchen", name: "Кухня", category_children: [] },
  { id: "pcat_sale", handle: "sale", name: "Распродажа", category_children: [] },
]

/** The shelves the mocked store API answers: by category, by collection, and the newest. */
const shelves = vi.hoisted(() => ({ current: {} as Record<string, HttpTypes.StoreProduct[]> }))
const answer = (products: HttpTypes.StoreProduct[]) => ({ response: { products, count: products.length }, nextPage: null })

const HITS = { label: BESTSELLERS_LABEL, source: { collection: "bestsellers" }, limit: 8 }
const NEWEST = { label: NEWEST_HEADING, source: { sort: "newest" as const }, limit: 8 }
const KITCHEN = { label: { ru: "Для кухни", en: "For the kitchen" }, source: { category: "the-kitchen" }, limit: 6 }
const SALE = { label: { ru: "Скидки", en: "On sale" }, source: { category: "sale" }, limit: 8 }

const blank = parseCollectionTabsProps(undefined)
if (!blank.ok) throw new Error("absent props must parse")
const props = (over: Partial<CollectionTabsProps> = {}): CollectionTabsProps => ({ ...blank.value, ...over })

const render = async (value: CollectionTabsProps) => {
  const tree = await CollectionTabs(value)
  return tree === null ? null : renderToStaticMarkup(tree)
}

const titles = (html: string) => Array.from(html.matchAll(/data-testid="product-wrapper"[^>]*>([^<]*)</g), (m) => m[1])
const tabsOf = (html: string) => Array.from(html.matchAll(/<button [^>]*role="tab"[^>]*>([^<]*)<\/button>/g), (m) => m[0])

beforeEach(() => {
  locale.current = "ru"
  shelves.current = { bestsellers: shelf("hit", 8), newest: shelf("new", 8), "the-kitchen": shelf("kitchen", 6), sale: [] }
  data.getHomeRegion.mockReset().mockResolvedValue({ id: "reg_ru", currency_code: "rub" })
  data.listCategories.mockReset().mockResolvedValue(CATEGORIES)
  data.getCollectionByHandle
    .mockReset()
    .mockImplementation(async (handle: string) =>
      handle === "bestsellers" ? { id: "pcol_hits", handle, title: "Хиты продаж" } : null
    )
  data.listProducts.mockReset().mockImplementation(async ({ queryParams }: { queryParams: Record<string, unknown> }) => {
    const limit = queryParams.limit as number
    const from = queryParams.collection_id
      ? shelves.current.bestsellers
      : queryParams.category_id
        ? shelves.current[(queryParams.category_id as string[])[0] === "pcat_sale" ? "sale" : "the-kitchen"]
        : shelves.current.newest
    return answer(from.slice(0, limit))
  })
})

describe("parseCollectionTabsProps", () => {
  it("reads absent props as the shop's bestsellers and the newest, four cards a row, no header", () => {
    expect(blank.ok && blank.value).toEqual({
      header: null,
      tabs: DEFAULT_TABS,
      columns: 4,
      seeAllLabel: SEE_ALL_LABEL,
      previousLabel: PREVIOUS_LABEL,
      nextLabel: NEXT_LABEL,
    })
    expect(DEFAULT_TABS.map((tab) => tab.source)).toEqual([{ collection: "bestsellers" }, { sort: "newest" }])
    expect(BESTSELLERS_LABEL.ru && BESTSELLERS_LABEL.en).toBeTruthy()
  })

  it("takes 2 to 4 tabs, each a label over a source of collection/featured's shape", () => {
    const result = parseCollectionTabsProps({
      tabs: [HITS, { label: { ru: "Новинки" } }, KITCHEN, { label: { en: "Cups" }, source: { collection: "cups" }, limit: 12 }],
      columns: 5,
    })
    expect(result.ok && result.value.tabs).toEqual([
      HITS,
      { label: { ru: "Новинки" }, source: { sort: "newest" }, limit: 8 },
      KITCHEN,
      { label: { en: "Cups" }, source: { collection: "cups" }, limit: 12 },
    ])
    expect(result.ok && result.value.columns).toBe(5)
  })

  it("refuses one tab or five, a tab with no words, and every bad field with its path", () => {
    const errors = (input: unknown) => {
      const result = parseCollectionTabsProps(input)
      return result.ok ? [] : result.errors
    }
    expect(errors({ tabs: [HITS] })).toEqual(["tabs has 1 items, at least 2"])
    expect(errors({ tabs: [HITS, NEWEST, KITCHEN, SALE, HITS] })).toEqual(["tabs has 5 items, at most 4"])
    expect(
      errors({
        tabs: [
          { label: {}, source: { sort: "bestsellers" } },
          { label: { ru: "я".repeat(25) }, limit: 3, rows: 2 },
        ],
        columns: 6,
        seeAllLabel: { ru: 1 },
        layout: "grid",
      })
    ).toEqual([
      "tabs[0].label needs words in at least one language",
      "tabs[0].source.sort must be one of: newest",
      "tabs[1].label.ru is 25 characters, at most 24",
      "tabs[1].limit must be a whole number from 4 to 12",
      "tabs[1].rows: not a field of tabs[1]",
      "columns must be a whole number from 3 to 5",
      "seeAllLabel.ru must be a string",
      "layout: not a prop of collection/tabs",
    ])
  })
})

describe("CollectionTabs", () => {
  const three = () => props({ tabs: [HITS, NEWEST, KITCHEN], header: { eyebrow: {}, heading: { ru: "Популярное" }, description: {}, seeAll: null } })

  it("draws the first tab's cards on the server and no other tab's", async () => {
    const html = (await render(three()))!
    expect(html).toContain('data-block="collection/tabs"')
    expect(titles(html)).toEqual(shelf("hit", 8).map((p) => p.title))
    // Every source is read once, so an empty tab is known before the first paint.
    expect(data.listProducts).toHaveBeenCalledTimes(3)
  })

  it("lays the tabs out as a WAI-ARIA tab list: one tab stop, the first chosen, one panel labelled by it", async () => {
    const html = (await render(three()))!
    expect(html).toMatch(/<div role="tablist" aria-label="Популярное" data-role="tab-list"/)
    const tabs = tabsOf(html)
    expect(tabs.map((tab) => tab.match(/>([^<]*)<\/button>$/)![1])).toEqual(["Хиты", "Новинки", "Для кухни"])
    expect(tabs.map((tab) => tab.match(/aria-selected="(\w+)"/)![1])).toEqual(["true", "false", "false"])
    expect(tabs.map((tab) => tab.match(/tabindex="(-?\d)"/)![1])).toEqual(["0", "-1", "-1"])
    for (const tab of tabs) expect(tab).toContain('data-role="tab-trigger"')
    for (const tab of tabs) expect(tab).toMatch(/class="[^"]*min-h-11/)

    const panelId = tabs[0].match(/aria-controls="([^"]+)"/)![1]
    const firstId = tabs[0].match(/ id="([^"]+)"/)![1]
    expect(tabs.every((tab) => tab.includes(`aria-controls="${panelId}"`))).toBe(true)
    expect(html).toContain(`<div role="tabpanel" id="${panelId}" aria-labelledby="${firstId}" data-role="tab-content"`)
  })

  it("puts «see all» to the chosen tab's source at the end of the row, and keeps the header the template's", async () => {
    const html = (await render(three()))!
    expect(html).toMatch(/<h2 data-role="heading"[^>]*>Популярное<\/h2>/)
    expect(html).toMatch(/<a href="\/ru\/collections\/bestsellers" data-role="cta-secondary" class="inline-flex min-h-11 [^"]*">Смотреть все<\/a>/)
    expect(html.match(/data-role="cta-secondary"/g)).toHaveLength(1)
  })

  it("drops a tab whose source is empty, and one whose read fails, keeping the others in order", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    data.getCollectionByHandle.mockRejectedValueOnce(new Error("socket hang up"))
    const html = (await render(props({ tabs: [HITS, SALE, NEWEST, KITCHEN] })))!
    expect(tabsOf(html).map((tab) => tab.match(/>([^<]*)<\/button>$/)![1])).toEqual(["Новинки", "Для кухни"])
    expect(titles(html)).toEqual(shelf("new", 8).map((p) => p.title))
    expect(log.mock.calls[0][0]).toBe('collection/tabs: could not read {"collection":"bestsellers"}')
    log.mockRestore()
  })

  it("draws one tab left as collection/featured would: no tab row, its label as the heading, «see all» in the header", async () => {
    const html = (await render(props({ tabs: [SALE, KITCHEN] })))!
    expect(html).not.toContain('role="tablist"')
    expect(html).not.toContain('role="tabpanel"')
    expect(html).toMatch(/<h2 data-role="heading"[^>]*>Для кухни<\/h2>/)
    expect(html).toContain('<a href="/ru/categories/the-kitchen" data-role="cta-secondary"')
    expect(titles(html)).toEqual(shelf("kitchen", 6).map((p) => p.title))

    const own = (await render(
      props({
        tabs: [SALE, KITCHEN],
        header: { eyebrow: {}, heading: { ru: "К столу" }, description: {}, seeAll: { href: "/store", label: { ru: "В каталог" } } },
      })
    ))!
    expect(own).toMatch(/<h2 data-role="heading"[^>]*>К столу<\/h2>/)
    expect(own).toContain('<a href="/ru/store" data-role="cta-secondary"')
  })

  it("draws nothing when no tab has a product", async () => {
    shelves.current.newest = []
    expect(await render(props({ tabs: [SALE, NEWEST] }))).toBeNull()
    expect(await render(entry.fixtures!.empty as CollectionTabsProps)).toBeNull()
  })

  it("lays every tab in collection/featured's carousel, on the template's photo layer", async () => {
    const html = (await render(three()))!
    expect(html).toMatch(/<ul id="[^"]+" class="[^"]*snap-x snap-mandatory/)
    expect(html).toContain("[--product-media-ratio:var(--layer-photo-aspect,3/4)]")
    expect(html).toContain('<li data-role="product-card" class="min-w-0 w-[42%] shrink-0 snap-start min-[720px]:w-[30%] small:w-[calc((100%-4.5rem)/4)]"')
    expect(html).toMatch(/aria-label="Вперёд"/)
  })
})

describe("loadTabCards", () => {
  it("answers another tab's cards, drawn on the server in the same carousel, in the visitor's language", async () => {
    locale.current = "en"
    const cards = await loadTabCards({ source: KITCHEN.source, limit: 6, columns: 3, previousLabel: PREVIOUS_LABEL, nextLabel: NEXT_LABEL })
    const html = renderToStaticMarkup(<>{cards}</>)
    expect(titles(html)).toEqual(shelf("kitchen", 6).map((p) => p.title))
    expect(html).toContain("small:w-[calc((100%-3rem)/3)]")
    expect(html).toMatch(/aria-label="Next"/)
  })

  it("refuses a request that is not one, and answers null for an empty source or a failed read", async () => {
    await expect(loadTabCards({ source: { sort: "bestsellers" }, limit: 40 })).rejects.toThrow(
      "collection/tabs: tab.source.sort must be one of: newest; tab.limit must be a whole number from 4 to 12"
    )
    expect(await loadTabCards({ source: SALE.source })).toBeNull()

    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    data.listProducts.mockRejectedValueOnce(new Error("socket hang up"))
    expect(await loadTabCards({ source: { sort: "newest" } })).toBeNull()
    expect(log.mock.calls[0][0]).toBe('collection/tabs: could not read {"sort":"newest"}')
    log.mockRestore()
  })
})

describe("the panel's state", () => {
  it("moves along the row with the arrows, wrapping, to the ends with Home and End, the other way right to left", () => {
    expect([tabAfterKey("ArrowRight", 0, 3, false), tabAfterKey("ArrowRight", 2, 3, false)]).toEqual([1, 0])
    expect([tabAfterKey("ArrowLeft", 0, 3, false), tabAfterKey("ArrowLeft", 2, 3, false)]).toEqual([2, 1])
    expect([tabAfterKey("Home", 2, 3, false), tabAfterKey("End", 0, 3, false)]).toEqual([0, 2])
    expect([tabAfterKey("ArrowLeft", 0, 3, true), tabAfterKey("ArrowRight", 0, 3, true)]).toEqual([1, 2])
    expect([tabAfterKey("ArrowDown", 0, 3, false), tabAfterKey("Enter", 0, 3, false)]).toEqual([null, null])
  })

  it("shows a loaded tab at once, and keeps the shown cards while another tab's load", () => {
    const start = initialTabState("hits")
    const waiting = chooseTab(start, 1)
    expect(waiting).toMatchObject({ selected: 1, shown: 0 })

    const arrived = settleTab(waiting, 1, "newest")
    expect(arrived).toEqual({ selected: 1, shown: 1, panels: { 0: "hits", 1: "newest" } })
    expect(chooseTab(arrived, 0)).toMatchObject({ selected: 0, shown: 0 })
  })

  it("keeps a tab that comes after the visitor moved on without showing it, and gives a tab that loads nothing back", () => {
    const moved = chooseTab(chooseTab(initialTabState("hits"), 1), 2)
    const late = settleTab(moved, 1, "newest")
    expect(late).toEqual({ selected: 2, shown: 0, panels: { 0: "hits", 1: "newest" } })

    expect(settleTab(late, 2, null)).toEqual({ ...late, selected: 0 })
    expect(settleTab(moved, 1, null)).toEqual(moved)
  })
})

describe("the registry entry", () => {
  it("is a lab home block of the collection category with the roles of R1's build list", () => {
    expect(blockById("collection/tabs")).toBe(entry)
    expect(entry).toMatchObject({ category: "collection", variant: "tabs", data: ["products", "categories"], status: "lab", placement: "home" })
    expect(entry.roles).toEqual(expect.arrayContaining(["section-header", "tab-list", "tab-trigger", "tab-content", "product-card", "price"]))
    expect(CATEGORY_BLOCKS.collection.map((b) => b.id)).toEqual(["collection/featured", "collection/tabs"])
  })

  it("stands in a template, and a template's bad tabs are refused with their path", () => {
    const manifest = structuredClone(getTemplate("long-morning")!.manifest)
    manifest.sections.push({ block: "collection/tabs", props: entry.fixtures!.sample })
    const result = validateTemplate(manifest, blockById)
    expect(result.ok ? [] : result.errors).toEqual([])

    manifest.sections[manifest.sections.length - 1] = { block: "collection/tabs", props: { tabs: [HITS] } }
    const refused = validateTemplate(manifest, blockById)
    expect(refused.ok ? [] : refused.errors.map((e) => e.message)).toEqual(["tabs has 1 items, at least 2"])
  })
})
