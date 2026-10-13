import type { HttpTypes } from "@medusajs/types"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { blockById, CATEGORY_BLOCKS } from "../../registry"
import PriceTable from "."
import { clampQuantity } from "./order-cell"
import { priceTable } from "./block"
import { LABELS, PRICE_LIST_HEADING, UNIT, parsePriceTableProps, type PriceTableProps } from "./props"
import { formatPrice, toRow, toRows } from "./rows"
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

const cart = vi.hoisted(() => ({ add: vi.fn() }))
vi.mock("@lib/cart-store", () => ({ useCartQueue: () => cart }))

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

type Stock = { manage_inventory?: boolean; allow_backorder?: boolean; inventory_quantity?: number }

const variant = (id: string, amount: number, stock: Stock = {}, original = amount, sku: string | null = `SKU-${id}`) =>
  ({
    id,
    title: id,
    sku,
    manage_inventory: true,
    allow_backorder: false,
    inventory_quantity: 7,
    ...stock,
    calculated_price: { calculated_amount: amount, original_amount: original, currency_code: "rub" },
  }) as unknown as HttpTypes.StoreProductVariant

const product = (handle: string, variants: HttpTypes.StoreProductVariant[], thumbnail: string | null = null) =>
  ({ id: `prod_${handle}`, handle, title: `Товар ${handle}`, thumbnail, variants }) as HttpTypes.StoreProduct

/** The shop's flat category list as `listCategories()` answers it: a parent and its leaf. */
const CATEGORIES = [
  { id: "pcat_house", handle: "household", name: "Хозтовары", category_children: [{ id: "pcat_bags" }] },
  { id: "pcat_bags", handle: "bags", name: "Мешки", category_children: [] },
]

const answer = (products: HttpTypes.StoreProduct[]) => ({ response: { products, count: products.length }, nextPage: null })

const SHELF = [
  product("gloves", [variant("v_gloves", 4900)]),
  product("apron", [variant("v_apron_s", 1290), variant("v_apron_m", 1490)]),
  product("film", [variant("v_film", 890, { inventory_quantity: 0 })]),
]

const blank = parsePriceTableProps(undefined)
if (!blank.ok) throw new Error("absent props must parse")
const props = (over: Partial<PriceTableProps> = {}): PriceTableProps => ({ ...blank.value, ...over })

const render = async (value: PriceTableProps) => {
  const tree = await PriceTable(value)
  return tree === null ? null : renderToStaticMarkup(tree)
}

const NBSP = " "

beforeEach(() => {
  locale.current = "ru"
  cart.add.mockReset()
  data.getHomeRegion.mockReset().mockResolvedValue({ id: "reg_ru", currency_code: "rub" })
  data.listCategories.mockReset().mockResolvedValue(CATEGORIES)
  data.getCollectionByHandle.mockReset().mockResolvedValue({ id: "pcol_trade", handle: "trade", title: "Опт" })
  data.listProducts.mockReset().mockResolvedValue(answer(SHELF))
})

describe("parsePriceTableProps", () => {
  it("reads absent props as the newest 20, SKU and stock, «шт», no note and the block's own words", () => {
    expect(blank.value).toEqual({
      header: null,
      source: { sort: "newest" },
      limit: 20,
      columns: ["sku", "stock"],
      unit: UNIT,
      note: {},
      labels: LABELS,
    })
    for (const text of [UNIT, PRICE_LIST_HEADING, ...Object.values(LABELS)]) {
      expect(text.ru && text.en).toBeTruthy()
    }
  })

  it("takes a category, a collection or one of the two sorts the store API answers, exactly one", () => {
    for (const source of [{ category: "bags" }, { collection: "trade" }, { sort: "newest" }, { sort: "title" }]) {
      expect(parsePriceTableProps({ source }).ok, JSON.stringify(source)).toBe(true)
    }
    expect(parsePriceTableProps({ source: { sort: "price" } }).ok).toBe(false)
    expect(parsePriceTableProps({ source: { category: "bags", collection: "trade" } }).ok).toBe(false)
    expect(parsePriceTableProps({ source: { category: "//evil" } }).ok).toBe(false)
  })

  it("takes 10 to 50 products", () => {
    expect(parsePriceTableProps({ limit: 10 }).ok).toBe(true)
    expect(parsePriceTableProps({ limit: 50 }).ok).toBe(true)
    expect(parsePriceTableProps({ limit: 9 }).ok).toBe(false)
    expect(parsePriceTableProps({ limit: 51 }).ok).toBe(false)
  })

  it("takes each column at most once and draws them in one order, whatever order the template wrote", () => {
    const result = parsePriceTableProps({ columns: ["unit", "sku"] })
    expect(result.ok && result.value.columns).toEqual(["sku", "unit"])
    expect(parsePriceTableProps({ columns: [] })).toMatchObject({ ok: true, value: { columns: [] } })
    expect(parsePriceTableProps({ columns: ["sku", "sku"] })).toEqual({ ok: false, errors: ["columns names sku twice"] })
    expect(parsePriceTableProps({ columns: ["tiers"] }).ok).toBe(false)
  })

  it("keeps the defaults of the labels a template does not name, and refuses one it does not know", () => {
    const result = parsePriceTableProps({ labels: { addToCart: { ru: "Купить" } } })
    expect(result.ok && result.value.labels).toEqual({ ...LABELS, addToCart: { ru: "Купить" } })
    expect(parsePriceTableProps({ labels: { buyNow: { ru: "Купить" } } }).ok).toBe(false)
    expect(parsePriceTableProps({ tiers: true }).ok).toBe(false)
  })
})

describe("the registry entry", () => {
  it("is listing/price-table, lab, home, in the listing file, with fixtures its parser accepts", () => {
    expect(blockById("listing/price-table")).toBe(priceTable)
    expect(CATEGORY_BLOCKS.listing).toContain(priceTable)
    expect(priceTable).toMatchObject({ status: "lab", placement: "home", data: ["products", "categories"] })
    expect(priceTable.setting).toBeUndefined()
    expect(priceTable.roles).toEqual(
      expect.arrayContaining(["section-header", "table", "table-row", "price", "quantity-input", "cta-primary"])
    )
    expect(parsePriceTableProps(priceTable.fixtures!.empty).ok).toBe(true)
    expect(parsePriceTableProps(priceTable.fixtures!.sample).ok).toBe(true)
  })
})

describe("toRow", () => {
  it("lets a product with one variant in stock be added, at most its stock", () => {
    const row = toRow(SHELF[0], "ru")
    expect(row).toMatchObject({ sku: "SKU-v_gloves", stock: "in", fromPrice: false, originalPrice: null })
    expect(row.price).toBe(`4${NBSP}900${NBSP}₽`)
    expect(row.order.kind === "add" && row.order.line.max).toBe(7)
    expect(row.order.kind === "add" && row.order.line.variant.id).toBe("v_gloves")
  })

  it("sets no limit when the shop does not count the stock or takes back orders", () => {
    const untracked = toRow(product("x", [variant("v", 100, { manage_inventory: false, inventory_quantity: 0 })]), "ru")
    expect(untracked.stock).toBe("in")
    expect(untracked.order.kind === "add" && untracked.order.line.max).toBeNull()
    const backorder = toRow(product("y", [variant("v", 100, { allow_backorder: true, inventory_quantity: 0 })]), "ru")
    expect(backorder.stock).toBe("backorder")
    expect(backorder.order.kind === "add" && backorder.order.line.max).toBeNull()
  })

  it("cannot add a sold-out variant with no back orders", () => {
    expect(toRow(SHELF[2], "ru")).toMatchObject({ stock: "out", order: { kind: "unavailable" } })
  })

  it("links a product with several variants to its page, at the cheapest price, «от» when they differ, no SKU", () => {
    const row = toRow(SHELF[1], "ru")
    expect(row).toMatchObject({ sku: null, fromPrice: true, order: { kind: "choose" } })
    expect(row.price).toBe(`1${NBSP}290${NBSP}₽`)
    const same = toRow(product("z", [variant("a", 500), variant("b", 500)]), "ru")
    expect(same.fromPrice).toBe(false)
  })

  it("reads a product as in stock when any variant is, to order when any takes orders", () => {
    const mixed = product("m", [variant("a", 1, { inventory_quantity: 0 }), variant("b", 1, { inventory_quantity: 3 })])
    expect(toRow(mixed, "ru").stock).toBe("in")
    const late = product("l", [variant("a", 1, { inventory_quantity: 0 }), variant("b", 1, { inventory_quantity: 0, allow_backorder: true })])
    expect(toRow(late, "ru").stock).toBe("backorder")
  })

  it("shows the pre-sale price while on sale", () => {
    const row = toRow(product("s", [variant("v", 900, {}, 1200)]), "ru")
    expect(row.originalPrice).toBe(`1${NBSP}200${NBSP}₽`)
  })

  it("has no price when the region prices no variant", () => {
    const bare = { ...variant("v", 1), calculated_price: undefined } as unknown as HttpTypes.StoreProductVariant
    expect(toRow(product("n", [bare]), "ru").price).toBeNull()
  })

  it("leaves out a product with no handle", () => {
    expect(toRows([...SHELF, { ...SHELF[0], id: "prod_x", handle: null } as unknown as HttpTypes.StoreProduct], "ru")).toHaveLength(3)
  })
})

describe("formatPrice", () => {
  it("drops the zero kopecks of a whole amount and keeps a no-break space before ₽ (QR-PRICE)", () => {
    expect(formatPrice(4900, "rub", "ru")).toBe(`4${NBSP}900${NBSP}₽`)
    expect(formatPrice(4900, "rub", "ru")).not.toMatch(/[,.]00/)
    expect(formatPrice(62.99, "eur", "en")).toBe("€62.99")
    expect(formatPrice(62.5, "eur", "en")).toBe("€62.50")
  })
})

describe("readSelection", () => {
  it("reads a category's whole branch, under its name", async () => {
    await expect(readSelection({ category: "household" }, 20)).resolves.toMatchObject({ title: "Хозтовары" })
    expect(data.listProducts).toHaveBeenCalledWith({
      regionId: "reg_ru",
      queryParams: { limit: 20, category_id: ["pcat_house", "pcat_bags"] },
    })
  })

  it("reads a collection under its title", async () => {
    await expect(readSelection({ collection: "trade" }, 30)).resolves.toMatchObject({ title: "Опт" })
    expect(data.listProducts).toHaveBeenCalledWith({ regionId: "reg_ru", queryParams: { limit: 30, collection_id: ["pcol_trade"] } })
  })

  it("asks the store API for its own order: the newest first, or A to Z", async () => {
    await readSelection({ sort: "newest" }, 10)
    expect(data.listProducts).toHaveBeenLastCalledWith({ regionId: "reg_ru", queryParams: { limit: 10, order: "-created_at" } })
    await readSelection({ sort: "title" }, 10)
    expect(data.listProducts).toHaveBeenLastCalledWith({ regionId: "reg_ru", queryParams: { limit: 10, order: "title" } })
  })

  it("asks for the region and the source's own record at once, the products after both", async () => {
    data.getHomeRegion.mockImplementation(() => new Promise(() => {}))
    void readSelection({ category: "household" }, 20)
    void readSelection({ collection: "trade" }, 30)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(data.listCategories).toHaveBeenCalledTimes(1)
    expect(data.getCollectionByHandle).toHaveBeenCalledWith("trade")
    expect(data.listProducts).not.toHaveBeenCalled()
  })

  it("answers null with no region, no such category or collection, or no product", async () => {
    data.getHomeRegion.mockResolvedValueOnce(null)
    await expect(readSelection({ sort: "newest" }, 10)).resolves.toBeNull()
    await expect(readSelection({ category: "nowhere" }, 10)).resolves.toBeNull()
    data.getCollectionByHandle.mockResolvedValueOnce(null)
    await expect(readSelection({ collection: "nowhere" }, 10)).resolves.toBeNull()
    data.listProducts.mockResolvedValueOnce(answer([]))
    await expect(readSelection({ sort: "newest" }, 10)).resolves.toBeNull()
  })
})

describe("PriceTable", () => {
  it("draws nothing when the source holds no product", async () => {
    data.listProducts.mockResolvedValueOnce(answer([]))
    expect(await render(props())).toBeNull()
    expect(await render(priceTable.fixtures!.empty)).toBeNull()
  })

  it("draws nothing when the read fails, and says so in the log", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const failure = new Error("502")
    data.listProducts.mockRejectedValueOnce(failure)
    expect(await render(props())).toBeNull()
    expect(logged).toHaveBeenCalledWith(`listing/price-table: could not read ${JSON.stringify(props().source)}`, failure)
    logged.mockRestore()
  })

  it("draws a table of rows with the brief's roles, one row per product", async () => {
    const html = (await render(props()))!
    expect(html).toContain('data-block="listing/price-table"')
    expect(html).toMatch(/<table role="table" data-role="table"/)
    expect(html.match(/data-role="table-row"/g)).toHaveLength(3)
    expect(html.match(/data-role="price"/g)).toHaveLength(3)
    expect(html).toContain('data-role="section-header"')
    // One stepper and one «В корзину»: the gloves; the apron links to its page; the film is sold out.
    expect(html.match(/data-role="quantity-input"/g)).toHaveLength(1)
    expect(html.match(/data-role="cta-primary"/g)).toHaveLength(1)
    expect(html).toContain('href="/ru/products/apron"')
    expect(html).toContain(">Выбрать<")
    expect(html).toMatch(/<button type="button" disabled=""[^>]*>Нет в наличии<\/button>/)
  })

  it("titles the section with the category's name, «Прайс-лист» for a sort, the template's words over both", async () => {
    expect(await render(props({ source: { category: "household" } }))).toContain(">Хозтовары</h2>")
    expect(await render(props())).toContain(">Прайс-лист</h2>")
    const own = await render(
      props({ header: { eyebrow: {}, heading: { ru: "Оптовый прайс" }, description: {}, seeAll: null } })
    )
    expect(own).toContain(">Оптовый прайс</h2>")
  })

  it("draws the columns the template picks, and no tier column", async () => {
    const all = (await render(props({ columns: ["sku", "stock", "unit"] })))!
    for (const head of [">Артикул<", ">Наличие<", ">Ед.<", ">Цена<", ">Количество<"]) expect(all).toContain(head)
    expect(all).toContain('data-role="stock-badge"')
    expect(all).toContain("SKU-v_gloves")
    expect(all).toContain("/ шт")
    const none = (await render(props({ columns: [] })))!
    for (const head of [">Артикул<", ">Наличие<", ">Ед.<"]) expect(none).not.toContain(head)
    expect(none).not.toContain('data-role="stock-badge"')
    expect(none).not.toContain("SKU-v_gloves")
    expect(all).not.toMatch(/tier|ступен/i)
  })

  it("marks the cheapest of several prices «от» and puts the note under the table", async () => {
    const html = (await render(props({ note: { ru: "Минимальный заказ — одна коробка." } })))!
    expect(html).toMatch(/>от<\/span><span data-role="price" data-testid="price"[^>]*>1\u00a0290\u00a0₽</)
    expect(html).toMatch(/<\/table><p data-role="description"[^>]*>Минимальный заказ — одна коробка.<\/p>/)
  })

  it("speaks the visitor's language", async () => {
    locale.current = "en"
    const html = (await render(props()))!
    expect(html).toContain(">Price list</h2>")
    expect(html).toContain(">Add to cart<")
    expect(html).toContain(">Choose<")
  })
})

describe("clampQuantity", () => {
  it("keeps the typed quantity between 1 and the stock", () => {
    expect(clampQuantity("12", null)).toBe(12)
    expect(clampQuantity("12", 7)).toBe(7)
    expect(clampQuantity("0", 7)).toBe(1)
    expect(clampQuantity("", 7)).toBe(1)
    expect(clampQuantity("abc", null)).toBe(1)
  })
})
