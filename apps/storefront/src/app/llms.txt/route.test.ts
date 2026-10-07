import { beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-10-08-13, part A7: `/llms.txt` of a live shop answered with the
 * starter's own text. It called the shop a «Live demo of the Gorgo Medusa DTC
 * Starter» whose orders «are not fulfilled» and whose payments are not taken,
 * listed 36 «storefront» languages for a shop published in one, and named a
 * category the shop's menu leaves out as empty. A host with a shop behind it
 * gets its own data and no line of that text; a host with none keeps the file
 * it had.
 */

const BASE = "https://shop.example"

const state = {
  handle: "acme" as string | null,
  enabledLocales: ["ru"] as string[] | null,
  defaultLocale: "ru",
  subtitle: undefined as string | undefined,
  /** `/store/products` asked for `id,categories.id`: which categories hold a card. */
  visible: [] as { id: string; categories: { id: string }[] }[],
  visibleFails: false,
}

const paths: string[] = []

const CATEGORIES = [
  { id: "pcat_tea", handle: "tea", name: "Чай", description: "Листовой чай", category_children: [] },
  { id: "pcat_honey", handle: "honey", name: "Мёд", description: null, category_children: [] },
]

const PRODUCTS = [
  { handle: "green-tea", title: "Зелёный чай", subtitle: null, description: "Чай с горных склонов" },
]

const answer = async (path: string, init?: { query?: Record<string, unknown> }) => {
  paths.push(path)

  if (path === "/store/products") {
    if (init?.query?.fields === "id,categories.id") {
      if (state.visibleFails) throw new Error("products read failed")
      return { products: state.visible, count: state.visible.length }
    }
    return { products: PRODUCTS, count: PRODUCTS.length }
  }
  if (path === "/store/tenant/product-categories" || path === "/store/product-categories") {
    return { product_categories: CATEGORIES }
  }
  if (path === "/store/tenant/collections" || path === "/store/collections") {
    return { collections: [{ handle: "new", title: "Новинки" }] }
  }
  throw new Error(`unexpected path ${path}`)
}

vi.mock("@lib/config", () => ({
  fetchWithoutLocale: (path: string, init?: { query?: Record<string, unknown> }) => answer(path, init),
  sdk: {
    client: {
      fetch: (path: string, init?: { query?: Record<string, unknown> }) => answer(path, init),
    },
  },
}))

vi.mock("@lib/data/cookies", () => ({
  getTenantHandle: async () => state.handle,
  getSiteName: async () => (state.handle ? "Лавка Акме" : "Starter"),
  getRequestBaseURL: async () => BASE,
  getEnabledLocales: async () => state.enabledLocales,
  getTenantDefaultLocale: async () => state.defaultLocale,
  getCacheOptions: async (tag: string) => ({ tags: [tag] }),
}))

vi.mock("@lib/data/site-wide", () => ({
  siteWideRead: async (_label: string, run: () => unknown) => run(),
}))

vi.mock("@lib/data/olavka-shop", () => ({ isOlavkaShop: async () => false }))

vi.mock("@lib/data/tenant-home", () => ({
  getEffectiveSettings: async () => null,
  getTenantHome: async () =>
    state.subtitle
      ? { content: { order: ["hero", "categories", "products"], hero: { subtitle: state.subtitle } } }
      : null,
}))

// The index of the home blocks imports every hero and listing component; the
// route reads two constants from it.
vi.mock("@modules/home/variants", () => ({
  DEFAULT_HERO: "k",
  DEFAULT_BLOCK_ORDER: ["hero", "categories", "products"],
}))

const messagesDir = join(dirname(fileURLToPath(import.meta.url)), "../../../messages")

// The REAL dictionary of the asked language, so a label that is not a key of
// it shows up here as a missing word.
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale }: { locale: string }) => {
    const messages = JSON.parse(readFileSync(join(messagesDir, `${locale}.json`), "utf8"))
    const read = (key: string) =>
      key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], messages)
    const t = (key: string) => String(read(key))
    t.has = (key: string) => typeof read(key) === "string"
    return t
  },
}))

const file = async () => {
  const { GET } = await import("./route")
  return (await GET()).text()
}

/** Every word of the starter's file that says something untrue of a shop. */
const STARTER_WORDS = [
  "demo",
  "Demo",
  "starter",
  "Starter",
  "Gorgo",
  "Medusa",
  "seeded",
  "not fulfilled",
  "storefront",
]

beforeEach(() => {
  paths.length = 0
  state.handle = "acme"
  state.enabledLocales = ["ru"]
  state.defaultLocale = "ru"
  state.subtitle = undefined
  state.visible = [{ id: "prod_1", categories: [{ id: "pcat_tea" }] }]
  state.visibleFails = false
})

describe("/llms.txt of a host with a shop", () => {
  it("carries no line of the starter's text", async () => {
    const text = await file()

    for (const word of STARTER_WORDS) {
      expect(text, word).not.toContain(word)
    }
    expect(text).not.toContain("locales")
    expect(text).not.toContain("Optional")
    expect(text).not.toContain("Browse")
  })

  it("opens with the shop's name and the description its home page gives", async () => {
    const text = await file()

    expect(text.split("\n").slice(0, 4)).toEqual([
      "# Лавка Акме",
      "",
      "> Каталог товаров магазина, условия доставки и оплаты.",
      "",
    ])
  })

  it("gives the owner's own line under the hero title when the shop wrote one", async () => {
    state.subtitle = "Чай и мёд с доставкой по России"

    expect(await file()).toContain("> Чай и мёд с доставкой по России\n")
  })

  it("labels its sections and links from the dictionary of the shop's language", async () => {
    const text = await file()

    expect(text).toContain("## Магазин\n\n- [Главная](https://shop.example)\n- [Все товары](https://shop.example/store)\n")
    expect(text).toContain("## Коллекции\n\n- [Новинки](https://shop.example/collections/new)\n")
    expect(text).toContain("## Категории\n")
    expect(text).toContain("## Товары\n\n- [Зелёный чай](https://shop.example/products/green-tea): Чай с горных склонов\n")
    expect(text).not.toMatch(/Home|All products|Categories|Products|Collections/)
  })

  it("lists no language when the shop is published in one", async () => {
    const text = await file()

    expect(text).not.toContain("## Язык")
    expect(text).not.toContain("https://shop.example/ru")
    expect(text).not.toContain("https://shop.example/en")
  })

  it("lists exactly the shop's languages when it is published in several", async () => {
    state.enabledLocales = ["ru", "en"]

    const text = await file()
    const section = text.slice(text.indexOf("## Язык"), text.indexOf("## Коллекции"))

    expect(section.match(/^- /gm)).toHaveLength(2)
    expect(section).toContain("(https://shop.example/ru)")
    expect(section).toContain("(https://shop.example/en)")
  })

  it("leaves out a category with no card a buyer can open, as the menu does", async () => {
    const text = await file()

    expect(text).toContain("- [Чай](https://shop.example/categories/tea): Листовой чай")
    expect(text).not.toContain("Мёд")
    expect(text).not.toContain("/categories/honey")
  })

  it("keeps every category when the product read fails", async () => {
    state.visibleFails = true

    const text = await file()

    expect(text).toContain("/categories/tea")
    expect(text).toContain("/categories/honey")
  })

  it("reads the shop's own categories and collections, not every shop's", async () => {
    await file()

    expect(paths).toContain("/store/tenant/product-categories")
    expect(paths).toContain("/store/tenant/collections")
    expect(paths).not.toContain("/store/product-categories")
    expect(paths).not.toContain("/store/collections")
  })

  it("labels a shop that saved English as its language in English, still with no starter text", async () => {
    state.enabledLocales = ["en"]
    state.defaultLocale = "en"

    const text = await file()

    expect(text).toContain("## Store\n\n- [Home](https://shop.example)\n- [All products](https://shop.example/store)\n")
    for (const word of STARTER_WORDS) {
      expect(text, word).not.toContain(word)
    }
  })
})

describe("/llms.txt of a host with no shop", () => {
  beforeEach(() => {
    state.handle = null
    state.enabledLocales = null
  })

  it("is the starter's file, as before", async () => {
    const text = await file()

    expect(text).toContain("> Live demo of the Gorgo Medusa DTC Starter")
    expect(text).toContain("## Browse\n\n- [Home](https://shop.example): Landing page describing the starter")
    expect(text).toContain("## Optional\n")
    expect(text).toContain("- [English storefront](https://shop.example/en): Same store in English")
    expect(text.match(/ storefront\]/g)).toHaveLength(36)
    expect(text).toContain("## Categories\n\n- [Чай](https://shop.example/categories/tea): Листовой чай\n- [Мёд](https://shop.example/categories/honey)")
  })

  it("reads the unscoped routes, as before", async () => {
    await file()

    expect(paths.sort()).toEqual(["/store/collections", "/store/product-categories", "/store/products"])
  })
})
