import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { HttpTypes } from "@medusajs/types"
import { clx } from "@medusajs/ui"
import type { AbstractIntlMessages } from "next-intl"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EMPTY_MANUAL_PAYMENT } from "@lib/tenant/manual-payment"
import { EMPTY_TENANT_PAYMENT_METHODS } from "@lib/tenant/payment-methods"
import { catalogViewControlsEnabled } from "@lib/util/catalog-view"
import { clientMessageFacts, clientMessages } from "@lib/util/client-messages"
import { EMPTY_PAYMENT_PRE_NOTICE } from "@lib/util/payment-pre-notice"

/**
 * Ask a0e1 (t-2026-10-06-09), the store lead's condition for stage A: a shop with no
 * `brands` category and without the view controls switched on does not change, neither the
 * markup of its catalog, nor its home page, nor the code of its pages. cherkashino.ru is under
 * Robokassa moderation while this lands.
 *
 * Every «before» below is dev at ab019ce1, the commit the branch was moved onto.
 */

const state = vi.hoisted(() => ({
  controls: false,
  cookiesRead: 0,
  categories: [] as unknown[],
  previews: [] as { id: string; layout?: string }[],
}))

vi.mock("next/headers", () => ({
  cookies: async () => {
    state.cookiesRead++
    return { get: (name: string) => ({ catalog_view: { value: "list" }, catalog_per_page: { value: "48" } })[name] }
  },
}))
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }))
vi.mock("@i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock("@lib/data/catalog-view", () => ({ catalogViewControlsOn: async () => state.controls }))
vi.mock("@lib/data/categories", () => ({ listCategories: async () => state.categories }))
vi.mock("@lib/data/regions", () => ({ getRegion: async () => ({ id: "reg_1" }) }))
vi.mock("@lib/data/products", () => ({
  listProductsWithSort: async ({ queryParams }: { queryParams: { limit: number } }) => ({
    response: { products: [{ id: "prod_1" }, { id: "prod_2" }], count: 30 },
    limit: queryParams.limit,
  }),
}))
// The card pulls the whole catalog UI in; the listing takes one class string from it.
vi.mock("@modules/products/components/product-card", () => ({
  PRODUCT_GRID_BESIDE_SIDEBAR_CLASS: "grid-beside-sidebar",
}))
vi.mock("@modules/home/components/listing-section", () => ({ HOME_SECTION_CLASS: "home-section" }))
vi.mock("@modules/products/components/product-preview", () => ({
  default: ({ product, layout }: { product: { id: string }; layout?: string }) => {
    state.previews.push({ id: product.id, layout })
    return <span>{product.id}</span>
  },
}))
vi.mock("@modules/store/components/pagination", () => ({
  Pagination: ({ page, totalPages }: { page: number; totalPages: number }) => (
    <nav data-page={page} data-total-pages={totalPages} />
  ),
}))
vi.mock("@modules/store/components/view-controls", () => ({
  default: ({ view, perPage }: { view: string; perPage: number }) => (
    <div data-testid="catalog-view-controls" data-view={view} data-per-page={perPage} />
  ),
}))
vi.mock("@modules/store/components/category-sidebar/subcategory-filter", () => ({
  default: ({ subcategories }: { subcategories: { handle: string }[] }) => (
    <div data-subcategories={subcategories.map((c) => c.handle).join(",")} />
  ),
}))

beforeEach(() => {
  state.controls = false
  state.cookiesRead = 0
  state.categories = []
  state.previews = []
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("the listing of a shop without the controls", () => {
  const render = async () => {
    const { default: PaginatedProducts } = await import("./templates/paginated-products")
    return renderToStaticMarkup(await PaginatedProducts({ page: 2, countryCode: "ru", sortBy: "created_at" }))
  }

  it("is dev's markup, twelve to a page, whatever cookie the buyer carries, and reads no cookie", async () => {
    const html = await render()

    expect(html).toBe(
      '<ul class="grid-beside-sidebar" data-testid="products-list" data-total-count="30">' +
        '<li class="min-w-0"><span>prod_1</span></li><li class="min-w-0"><span>prod_2</span></li></ul>' +
        '<nav data-page="2" data-total-pages="3"></nav>'
    )
    expect(state.cookiesRead).toBe(0)
    // The card the listing draws is the card dev drew: `card` is ProductCard's default.
    expect(state.previews.map((preview) => preview.layout)).toEqual(["card", "card"])
  })

  it("gets the controls, the buyer's view and page size only with the switch on", async () => {
    state.controls = true
    const html = await render()

    expect(html).toContain('<div data-testid="catalog-view-controls" data-view="list" data-per-page="48"></div>')
    expect(html).toContain('data-testid="products-list" data-total-count="30" data-view="list"')
    // Thirty products at forty-eight a page are one page: no pagination.
    expect(html).not.toContain("<nav")
    expect(state.cookiesRead).toBe(1)
    expect(state.previews.map((preview) => preview.layout)).toEqual(["row", "row"])
  })

  it("draws dev's card: the `card` layout keeps the card's class string as it was", () => {
    const card = readFileSync(path.resolve(__dirname, "../products/components/product-card/index.tsx"), "utf8")
    const before =
      '"group flex h-full flex-col rounded-[var(--radius,8px)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ui-fg-interactive"'

    expect(card).toMatch(new RegExp(`:\\s*${before.replace(/[[\]().,-]/g, "\\$&")}\\s*\\}`))
    expect(card).toContain('<div className={row ? "relative w-28 shrink-0 small:w-40" : "relative"}>')
    expect(card).toContain('<div className={row ? "flex min-w-0 flex-1 flex-col self-stretch" : "mt-3 flex flex-1 flex-col"}>')
  })
})

describe("the switch the controls sit behind", () => {
  it("is off with no value and with anything but 1, true or the shop's handle", () => {
    for (const value of [undefined, "", "0", "false", "yes", "olavka-two"]) {
      expect(catalogViewControlsEnabled("bpj", { STOREFRONT_CATALOG_VIEW_CONTROLS: value }), String(value)).toBe(false)
    }
    expect(catalogViewControlsEnabled(null, { STOREFRONT_CATALOG_VIEW_CONTROLS: "bpj" })).toBe(false)
  })

  it("is on for every shop with 1 or true, and for the shops a list names", () => {
    for (const value of ["1", "true", " TRUE "]) {
      expect(catalogViewControlsEnabled("bpj", { STOREFRONT_CATALOG_VIEW_CONTROLS: value }), value).toBe(true)
      expect(catalogViewControlsEnabled(null, { STOREFRONT_CATALOG_VIEW_CONTROLS: value }), value).toBe(true)
    }
    const list = { STOREFRONT_CATALOG_VIEW_CONTROLS: " bpj , other-shop" }
    expect(catalogViewControlsEnabled("bpj", list)).toBe(true)
    expect(catalogViewControlsEnabled("other-shop", list)).toBe(true)
    expect(catalogViewControlsEnabled("cherkashino", list)).toBe(false)
  })

  it("reads the container's environment by default", () => {
    vi.stubEnv("STOREFRONT_CATALOG_VIEW_CONTROLS", "bpj")
    expect(catalogViewControlsEnabled("bpj")).toBe(true)
    expect(catalogViewControlsEnabled("cherkashino")).toBe(false)
  })
})

type Category = HttpTypes.StoreProductCategory

const category = (id: string, parent: string | null, children: string[] = []): Category =>
  ({
    id,
    handle: id,
    name: id.toUpperCase(),
    parent_category_id: parent,
    category_children: children.map((child) => ({ id: child, handle: child, name: child.toUpperCase() })),
  }) as Category

/** The side column of dev, as it stood at ab019ce1, without the subcategory checkboxes. */
const BeforeLinks = ({ categories, activeCategoryId }: { categories: Category[]; activeCategoryId?: string }) => (
  <div className="flex flex-col gap-1">
    {categories
      .filter((c) => !c.parent_category_id)
      .map((c) => (
        <a
          key={c.id}
          href={`/categories/${c.handle}`}
          className={clx(
            "txt-compact-small text-ui-fg-base hover:text-ui-fg-base hover:bg-ui-bg-subtle rounded-md transition-colors w-full px-2 py-1",
            { "text-ui-fg-base font-medium bg-ui-bg-base-hover": c.id === activeCategoryId }
          )}
        >
          {c.name}
        </a>
      ))}
  </div>
)

describe("the catalog's side column", () => {
  const twoLevels = [
    category("hair", null, ["shampoo", "mask"]),
    category("shampoo", "hair"),
    category("mask", "hair"),
    category("skin", null, ["cream"]),
    category("cream", "skin"),
  ]

  const render = async (categories: Category[], activeCategoryId?: string) => {
    const { default: CategorySidebar } = await import("./components/category-sidebar")
    return renderToStaticMarkup(<CategorySidebar categories={categories} activeCategoryId={activeCategoryId} />)
  }

  it.each([undefined, "hair", "shampoo", "cream"])(
    "of a shop of two levels is dev's, on the page of %s",
    async (active) => {
      const html = await render(twoLevels, active)

      expect(html).toContain(renderToStaticMarkup(<BeforeLinks categories={twoLevels} activeCategoryId={active} />))
    }
  )

  it("of a shop of three levels draws the open branch under its root", async () => {
    const threeLevels = [
      category("hair", null, ["care"]),
      category("care", "hair", ["shampoo"]),
      category("shampoo", "care"),
      category("skin", null),
    ]
    const html = await render(threeLevels, "shampoo")

    expect(html).toMatch(/href="\/categories\/hair"[^>]*>HAIR<\/a><a href="\/categories\/care" class="[^"]*ps-5[^"]*">CARE<\/a><a href="\/categories\/shampoo" class="[^"]*ps-8[^"]*font-medium/)
    expect(html).toContain('href="/categories/skin"')
  })
})

describe("the home page of a shop without a `brands` category", () => {
  it("gets no brands block", async () => {
    state.categories = [category("hair", null, ["brands"]), category("brands", "hair", ["lebel"])]
    const { default: HomeBrands } = await import("@modules/home/components/home-brands")

    expect(await HomeBrands()).toBeNull()
  })

  it("and a shop that keeps one does", async () => {
    state.categories = [category("brands", null, ["lebel"]), category("lebel", "brands")]
    const { default: HomeBrands } = await import("@modules/home/components/home-brands")

    expect(renderToStaticMarkup(await HomeBrands())).toContain('data-brand-handle="lebel"')
  })
})

describe("the dictionary the pages of a shop without the controls hand to the browser", () => {
  const MESSAGES_DIR = path.resolve(__dirname, "../../../messages")
  const LOCALES = readdirSync(MESSAGES_DIR).filter((name) => name.endsWith(".json"))
  /** The keys ask a0e1 added; dev's catalogue is the branch's without them. */
  const ADDED = ["brands", "allBrands", "view", "viewGrid", "viewList", "viewCompact", "perPage"]

  const robokassaShop = (catalogViewControls: boolean) =>
    clientMessageFacts({
      shop: true,
      paymentMethods: { ...EMPTY_TENANT_PAYMENT_METHODS, robokassa: true, demo: false },
      manualPayment: EMPTY_MANUAL_PAYMENT,
      analytics: { yandexMetricaId: null, ga4MeasurementId: null },
      onboarding: false,
      paymentPreNotice: EMPTY_PAYMENT_PRE_NOTICE,
      catalogViewControls,
    })

  const catalogue = (file: string): AbstractIntlMessages =>
    JSON.parse(readFileSync(path.join(MESSAGES_DIR, file), "utf8"))

  const withoutAdded = (messages: AbstractIntlMessages): AbstractIntlMessages => ({
    ...messages,
    Store: Object.fromEntries(
      Object.entries(messages.Store as AbstractIntlMessages).filter(([key]) => !ADDED.includes(key))
    ),
  })

  it("has all 36 catalogues to check", () => {
    expect(LOCALES).toHaveLength(36)
  })

  it.each(LOCALES)("is dev's, byte for byte, in %s", (file) => {
    const messages = catalogue(file)

    expect(Object.keys(messages.Store as AbstractIntlMessages)).toEqual(["allProducts", ...ADDED])
    expect(JSON.stringify(clientMessages(messages, robokassaShop(false)))).toBe(
      JSON.stringify(clientMessages(withoutAdded(messages), robokassaShop(false)))
    )
  })

  it("carries the names of the views with the switch on, and never the brands' strings", () => {
    const store = clientMessages(catalogue("ru.json"), robokassaShop(true)).Store as AbstractIntlMessages

    expect(Object.keys(store)).toEqual(["allProducts", "view", "viewGrid", "viewList", "viewCompact", "perPage"])
  })

  // The brands' strings are cut for every shop; that is right only while no client
  // component reads them.
  it("no client component reads the brands' strings", () => {
    const SRC_DIR = path.resolve(__dirname, "../..")
    const sources: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
        } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          sources.push(full)
        }
      }
    }
    walk(SRC_DIR)

    const readers = sources.filter((file) => /t\("(Store\.)?(brands|allBrands)"\)/.test(readFileSync(file, "utf8")))

    expect(readers.map((file) => path.relative(SRC_DIR, file)).sort()).toEqual([
      "app/[locale]/(main)/brands/page.tsx",
      "modules/home/components/home-brands/index.tsx",
    ])
    for (const file of readers) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/^["']use client["']/m)
    }
  })
})
