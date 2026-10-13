import type { ReactElement, ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ProductCard from "@modules/products/components/product-card"

import { blockById } from "../../registry"
import Bundle from "."
import type { BundleLine } from "./add-bundle-button"
import { bundle as entry } from "./block"
import { BUTTON_LABEL, CHOOSE_HINT, parseBundleProps, TITLE, TOTAL_LABEL, type BundleProps } from "./props"

vi.mock("server-only", () => ({}))

const locale = vi.hoisted(() => ({ current: "ru" }))
vi.mock("next-intl/server", () => ({
  getLocale: async () => locale.current,
  getTranslations: async () => (key: string, values?: { percent?: number }) =>
    key === "sale" ? `Скидка ${values?.percent}%` : key,
}))
vi.mock("@i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={`/ru${href}`} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock("@modules/products/components/product-media", () => ({
  default: ({ src, alt }: { src: string | null; alt: string }) => (
    <div data-product-media="card" data-product-media-state={src ? "photo" : "placeholder"} data-src={src ?? ""} data-alt={alt} />
  ),
}))

// The storefront's own card, drawn beside the bundle's in "the cards are the storefront's card"; its wishlist is not a role.
vi.mock("@lib/data/wishlist", () => ({ getWishlistProductIds: async () => [], isWishlistCustomerLoggedIn: async () => false }))
vi.mock("@modules/products/components/wishlist-button", () => ({ default: () => null }))

const getHomeRegion = vi.hoisted(() => vi.fn())
vi.mock("@lib/data/home", () => ({ getHomeRegion }))
const listProducts = vi.hoisted(() => vi.fn())
vi.mock("@lib/data/products", () => ({ listProducts }))

// The button is a client component with the cart's hooks; here it shows what it was given.
vi.mock("./add-bundle-button", () => ({
  default: ({ lines, label, disabled, describedBy }: { lines: BundleLine[]; label: string; disabled: boolean; describedBy?: string }) => (
    <button
      data-role="cta-primary"
      data-lines={lines.map((line) => line.variant.id).join(",")}
      disabled={disabled}
      aria-describedby={describedBy}
    >
      {label}
    </button>
  ),
}))

const cartQueue = vi.hoisted(() => ({ add: vi.fn() }))
const cartSidebar = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock("@lib/cart-store", () => ({ useCartQueue: () => cartQueue }))
vi.mock("@modules/layout/components/cart-sidebar/context", () => ({ useCartSidebar: () => cartSidebar }))

/* ------------------------------------------------------------------ the shop */

const variant = (
  id: string,
  amount: number | null,
  stock: number | "untracked" = "untracked",
  { options = [], original = amount }: { options?: string[]; original?: number | null } = {}
) => ({
  id,
  title: id,
  manage_inventory: stock !== "untracked",
  allow_backorder: false,
  inventory_quantity: stock === "untracked" ? 0 : stock,
  options: options.map((value) => ({ id: value })),
  calculated_price:
    amount === null
      ? null
      : {
          calculated_amount: amount,
          original_amount: original,
          currency_code: "usd",
          calculated_price: { price_list_type: original !== amount ? "sale" : "default" },
        },
})

type Option = { id: string; title: string; values: { id: string; value: string; metadata?: { hex: string } }[] }

const product = (handle: string, title: string, variants: ReturnType<typeof variant>[], options: Option[] = []) => ({
  id: `prod_${handle}`,
  handle,
  title,
  thumbnail: `https://shipshift.dev/static/${handle}.webp`,
  images: [{ id: `img_${handle}`, url: `https://shipshift.dev/static/${handle}.webp` }],
  metadata: {},
  options,
  variants,
})

const candle = product("candle-holder", "Подсвечник", [variant("var_candle", 37.99)])
const rail = product("hook-rail", "Вешалка", [variant("var_rail", 53.99)])
// Two sizes its variants use and one no variant has: the card's unit line names the two.
const mug = product(
  "mug",
  "Кружка",
  [
    variant("var_mug_s", 25.99, "untracked", { options: ["ov_s"] }),
    variant("var_mug_l", 29.99, "untracked", { options: ["ov_l"] }),
  ],
  [{ id: "opt_size", title: "Размер", values: [{ id: "ov_s", value: "S" }, { id: "ov_l", value: "L" }, { id: "ov_xl", value: "XL" }] }]
)
// Two colours: the card draws them as dots, not in the unit line. The shop's own option colours, not the block's.
const blanket = product(
  "throw",
  "Плед",
  [
    variant("var_throw_sand", 45, "untracked", { options: ["ov_sand"] }),
    variant("var_throw_ink", 45, "untracked", { options: ["ov_ink"] }),
  ],
  [
    {
      id: "opt_colour",
      title: "Цвет",
      values: [
        // Any colour the shop stores; a theme variable here keeps the fixture off lint:blocks' hex rule.
        { id: "ov_sand", value: "Песок", metadata: { hex: "var(--chart-1)" } },
        { id: "ov_ink", value: "Чернила", metadata: { hex: "var(--chart-2)" } },
      ],
    },
  ]
)
// On sale: 60 instead of 80, so 25 % off.
const lamp = product("lamp", "Лампа", [variant("var_lamp", 60, "untracked", { original: 80 })])
const vase = product("vase", "Ваза", [variant("var_vase", 41, 0)])
const unpriced = product("unpriced", "Без цены", [variant("var_unpriced", null)])

const shop = (...products: ReturnType<typeof product>[]) =>
  listProducts.mockResolvedValue({ response: { products, count: products.length }, nextPage: null })

const props = (products: string[], extra: Partial<BundleProps> = {}): BundleProps => {
  const parsed = parseBundleProps({ products, ...extra })
  if (!parsed.ok) throw new Error(parsed.errors.join("; "))
  return parsed.value
}

const render = async (value: BundleProps) => {
  const tree = await Bundle(value)
  return tree === null ? null : renderToStaticMarkup(tree)
}

const money = (amount: number) =>
  new Intl.NumberFormat(locale.current, { style: "currency", currency: "usd", currencyDisplay: "symbol" }).format(amount)

const count = (html: string, needle: string) => html.split(needle).length - 1

beforeEach(() => {
  locale.current = "ru"
  getHomeRegion.mockReset()
  getHomeRegion.mockResolvedValue({ id: "reg_us", currency_code: "usd" })
  listProducts.mockReset()
  cartQueue.add.mockReset()
  cartSidebar.open.mockReset()
})

/* ------------------------------------------------------------------ props */

describe("parseBundleProps", () => {
  it("takes 2–4 product handles and gives the set's own words their Russian and English defaults", () => {
    const parsed = parseBundleProps({ products: ["candle-holder", "hook-rail"] })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.header).toBeNull()
    expect(parsed.value.title).toEqual(TITLE)
    expect(parsed.value.note).toEqual({})
    expect(parsed.value.totalLabel).toEqual(TOTAL_LABEL)
    expect(parsed.value.buttonLabel).toEqual({ ru: "Добавить набор", en: "Add the set" })
    expect(parsed.value.chooseLabel).toEqual({ ru: "Выбрать вариант", en: "Choose an option" })
  })

  it("asks for the products, at least two and at most four", () => {
    expect(parseBundleProps(undefined)).toEqual({ ok: false, errors: ["products is required"] })
    expect(parseBundleProps({ products: ["mug"] })).toEqual({ ok: false, errors: ["products has 1 items, at least 2"] })
    expect(parseBundleProps({ products: ["a", "b", "c", "d", "e"] })).toEqual({
      ok: false,
      errors: ["products has 5 items, at most 4"],
    })
  })

  it("refuses a handle that is not one and a product named twice", () => {
    expect(parseBundleProps({ products: ["mug", "Hook Rail"] })).toEqual({
      ok: false,
      errors: ["products[1] must be a product handle of the shop (letters, digits, - and _)"],
    })
    expect(parseBundleProps({ products: ["mug", "vase", "mug"] })).toEqual({
      ok: false,
      errors: ["products[2]: mug is already in the set"],
    })
  })

  it("refuses a prop it does not know, such as a discount", () => {
    const parsed = parseBundleProps({ products: ["mug", "vase"], discount: 0.1 })
    expect(parsed).toEqual({ ok: false, errors: ["discount: not a prop of collection/bundle"] })
  })
})

/* ------------------------------------------------------------------ the registry */

describe("the registry entry", () => {
  it("is collection/bundle, lab, on the home page, reading products, with both fixtures accepted", () => {
    expect(blockById("collection/bundle")).toBe(entry)
    expect(entry.roles).toEqual(["section-header", "product-card", "price", "cta-primary", "card"])
    expect(entry.data).toEqual(["products"])
    expect(entry.status).toBe("lab")
    expect(entry.placement).toBe("home")
    expect(parseBundleProps(entry.fixtures!.empty).ok).toBe(true)
    expect(parseBundleProps(entry.fixtures!.sample).ok).toBe(true)
  })
})

/* ------------------------------------------------------------------ reading the shop */

describe("Bundle, reading", () => {
  it("asks the shop for the set's handles in the home region", async () => {
    shop(candle, rail)
    await render(props(["candle-holder", "hook-rail"]))
    expect(listProducts).toHaveBeenCalledWith({
      regionId: "reg_us",
      queryParams: { handle: ["candle-holder", "hook-rail"], limit: 2 },
    })
  })

  it("draws nothing when fewer than two products are found", async () => {
    shop(candle)
    expect(await render(props(["candle-holder", "no-such-product"]))).toBeNull()
  })

  it("leaves out a product with no price in the region, and draws nothing when that leaves one", async () => {
    shop(candle, unpriced)
    expect(await render(props(["candle-holder", "unpriced"]))).toBeNull()
  })

  it("draws nothing without a region or when the read fails", async () => {
    getHomeRegion.mockResolvedValue(null)
    expect(await render(props(["candle-holder", "hook-rail"]))).toBeNull()

    getHomeRegion.mockResolvedValue({ id: "reg_us" })
    listProducts.mockRejectedValue(new Error("down"))
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await render(props(["candle-holder", "hook-rail"]))).toBeNull()
    expect(error).toHaveBeenCalledWith("collection/bundle: could not read the products candle-holder, hook-rail")
    error.mockRestore()
  })
})

/* ------------------------------------------------------------------ drawing */

describe("Bundle, drawing", () => {
  it("draws the cards in the template's order with a plus between them, and the sum of their prices", async () => {
    shop(rail, mug, candle)
    const html = (await render(props(["candle-holder", "hook-rail", "mug"], { title: { ru: "Тихий вечер" } })))!

    expect(html).toContain('data-block="collection/bundle"')
    const titles = Array.from(html.matchAll(/data-testid="product-title"[^>]*>([^<]*)</g)).map((match) => match[1])
    expect(titles).toEqual(["Подсвечник", "Вешалка", "Кружка"])
    expect(count(html, 'data-testid="product-wrapper"')).toBe(3)
    expect(count(html, 'data-role="product-card"')).toBe(3)
    expect(count(html, "lucide-plus")).toBe(2)
    expect(count(html, 'data-role="price"')).toBe(3)
    expect(html).toContain('href="/ru/products/candle-holder"')

    // The mug's card shows its cheapest variant, as ProductCard does, and the sum counts that price.
    expect(html).toContain(money(25.99))
    expect(html).toContain(money(37.99 + 53.99 + 25.99))
    expect(html).toContain("Тихий вечер")
    expect(html).toContain('data-role="card"')
  })

  it("adds every product with one variant, and the button is on when all are in stock", async () => {
    shop(candle, rail)
    const html = (await render(props(["candle-holder", "hook-rail"])))!
    expect(html).toContain('data-lines="var_candle,var_rail"')
    expect(html).toContain(">Добавить набор</button>")
    expect(html).not.toContain("disabled")
    expect(html).not.toContain("aria-describedby")
  })

  it("turns the button off when a product is out of stock, and names it", async () => {
    shop(candle, vase)
    const html = (await render(props(["candle-holder", "vase"])))!
    expect(html).toMatch(/<button[^>]*disabled=""/)
    expect(html).toContain("Нет в наличии: Ваза")
    const id = html.match(/aria-describedby="([^"]+)"/)?.[1]
    expect(id).toBeTruthy()
    expect(html).toContain(`id="${id}"`)
  })

  it("sends a product with several variants to its page instead of adding it, and says so under the button", async () => {
    shop(candle, rail, mug)
    const html = (await render(props(["candle-holder", "hook-rail", "mug"])))!
    expect(html).toContain('data-lines="var_candle,var_rail"')
    expect(html).toMatch(/href="\/ru\/products\/mug"[^>]*>Выбрать вариант<\/a>/)
    expect(count(html, "Выбрать вариант")).toBe(1)
    expect(html).toContain(CHOOSE_HINT.ru)
  })

  it("draws no button when every product needs a choice", async () => {
    const jug = product("jug", "Кувшин", [variant("var_jug_s", 30), variant("var_jug_l", 40)])
    shop(mug, jug)
    const html = (await render(props(["mug", "jug"])))!
    expect(html).not.toContain("<button")
    expect(count(html, "Выбрать вариант")).toBe(2)
    expect(html).not.toContain(CHOOSE_HINT.ru)
  })

  it("promises no discount: no old sum, no saving", async () => {
    shop(candle, rail)
    const html = (await render(props(["candle-holder", "hook-rail"], { note: { ru: "Вместе удобнее" } })))!
    expect(html).toContain("Вместе удобнее")
    expect(html).not.toMatch(/line-through|Выгода|скидк/i)
  })

  it("speaks the visitor's language", async () => {
    locale.current = "en"
    shop(candle, rail, mug)
    const html = (await render(props(["candle-holder", "hook-rail", "mug"])))!
    expect(html).toContain(`>${BUTTON_LABEL.en}</button>`)
    expect(html).toContain(TOTAL_LABEL.en)
    expect(html).toContain("Choose an option")
    expect(html).toContain(TITLE.en)
  })

  it("draws with tokens only: no literal colours or radii, the button on the template's button layer", async () => {
    shop(candle, rail, mug)
    const html = (await render(props(["candle-holder", "hook-rail", "mug"])))!
    expect(html).not.toMatch(/\b(?:bg|text|border)-(?:black|white)\b|#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i)
    // QR-RADIUS: a corner is the template's radius; `rounded-sm` on «Выбрать вариант» drew 2 px under every template.
    expect(html).not.toMatch(/\brounded(?:-(?:[se][se]?|[tblr][lr]?))?-(?:none|xs|sm|md|lg|xl|2xl|3xl|full)\b|\brounded(?=[\s"])/)
    expect(html).toContain("rounded-[var(--radius)]")
  })

  it("frames the pictures in the template's photo layer, 3 / 4 with no template", async () => {
    shop(candle, rail)
    const html = (await render(props(["candle-holder", "hook-rail"])))!
    expect(html).toMatch(/<ul class="[^"]*\[--product-media-ratio:var\(--layer-photo-aspect,3\/4\)\]/)
  })
})

/* ------------------------------------------------------------------ one card for one product */

// The card roles `template:check` reads in a card, in document order (scripts/template-check/measure.mjs, CARD_ROLES).
const CARD_ROLES: [RegExp, string][] = [
  [/data-product-media="/, "card-media"],
  [/data-testid="product-sale-badge"/, "card-badge"],
  [/data-testid="product-title"/, "card-title"],
  [/data-testid="price"/, "card-price"],
  [/data-testid="original-price"/, "card-price-old"],
  [/data-testid="product-unit"/, "card-meta"],
  [/data-testid="product-excerpt"/, "card-meta"],
]

/** Each product card of the markup: its link, the roles in order, and the classes and text of its title, unit and price. */
const cardsOf = (html: string) =>
  html
    .split(/(?=<a [^>]*data-testid="product-wrapper")/)
    .filter((chunk) => /^<a [^>]*data-testid="product-wrapper"/.test(chunk))
    .map((card) => {
      const roles: string[] = []
      for (const tag of card.match(/<[a-z][^>]*>/g) ?? []) {
        const role = CARD_ROLES.find(([pattern]) => pattern.test(tag))?.[1]
        if (role && roles[roles.length - 1] !== role) roles.push(role)
      }
      const part = (testid: string) => {
        const match = card.match(new RegExp(`<(\\w+)([^>]*data-testid="${testid}"[^>]*)>([^<]*)`))
        return match ? { class: match[2].match(/class="([^"]*)"/)?.[1] ?? "", text: match[3] } : null
      }
      return {
        href: card.match(/href="([^"]+)"/)?.[1],
        sig: roles.join(">"),
        title: part("product-title"),
        unit: part("product-unit"),
        price: part("price"),
        old: part("original-price"),
        badge: card.includes('data-testid="product-sale-badge"'),
        dots: card.match(/<span title="[^"]*" class="inline-block size-3[^>]*>/g) ?? [],
      }
    })

const storefrontCard = async (item: ReturnType<typeof product>) =>
  cardsOf(
    renderToStaticMarkup(await ProductCard({ product: item as unknown as Parameters<typeof ProductCard>[0]["product"] }))
  )[0]

describe("Bundle, one card for one product", () => {
  // Decision (a), t-2026-10-12-33 bundle-card-grammar: a set's item is a product card. Beside `collection/tabs` the
  // block's 16 px title and its missing unit line gave one product two card signatures (QR-CARD-GRAMMAR) and the
  // card title two sizes (QR-TYPE-ROLE) on katalog.
  it("draws each product with the storefront card's signature, title, unit line, dots and price", async () => {
    shop(candle, rail, mug, blanket)
    const html = (await render(props(["candle-holder", "hook-rail", "mug", "throw"])))!
    const cards = cardsOf(html)
    expect(cards).toHaveLength(4)

    const items = [candle, rail, mug, blanket]
    for (let index = 0; index < items.length; index++) {
      const own = await storefrontCard(items[index])
      expect(cards[index].href).toBe(own.href)
      expect(cards[index].sig).toBe(own.sig)
      expect(cards[index].sig).toBe("card-media>card-title>card-meta>card-price")
      expect(cards[index].title?.class).toBe(own.title?.class)
      // The unit line says what the card's says; it is 12 px, not the card's arbitrary 13 px (index.tsx, the doc comment).
      expect(cards[index].unit?.text).toBe(own.unit?.text)
      expect(cards[index].dots).toEqual(own.dots)
      expect(cards[index].price).toEqual(own.price)
    }
    // The title at the card's 14 px, not the 16 px that differed from the tabs beside it.
    expect(cards[0].title?.class).toMatch(/(?:^| )text-sm(?: |$)/)
    expect(cards[0].title?.class).not.toMatch(/(?:^| )text-base(?: |$)/)
    // The unit line names the sizes a variant uses and keeps its slot when empty; colours are dots.
    expect(cards[0].unit?.text).toBe("")
    expect(cards[2].unit?.text).toBe("S · L")
    expect(cards[3].unit?.text).toBe("")
    expect(cards[3].dots).toHaveLength(2)
  })

  it("draws a product on sale as the storefront card does: its badge and old price, and the sum still of today's prices", async () => {
    shop(candle, lamp)
    const html = (await render(props(["candle-holder", "lamp"])))!
    const [, card] = cardsOf(html)
    const own = await storefrontCard(lamp)

    expect(card.sig).toBe(own.sig)
    expect(card.sig).toBe("card-media>card-badge>card-title>card-meta>card-price>card-price-old")
    expect(card.badge).toBe(true)
    expect(card.price).toEqual(own.price)
    expect(card.old?.text).toBe(own.old?.text)
    expect(card.old?.text).toBe(money(80))
    // The set promises no discount of its own: the sum is today's prices, and there is no old sum.
    expect(html).toContain(money(37.99 + 60))
    expect(html).not.toContain(money(37.99 + 80))
    expect(count(html, "line-through")).toBe(1)
  })
})

/* ------------------------------------------------------------------ the button */

describe("AddBundleButton", () => {
  it("adds each product once through the cart queue, then opens the cart as «В корзину» does", async () => {
    const { default: AddBundleButton } = await vi.importActual<typeof import("./add-bundle-button")>("./add-bundle-button")
    const lines: BundleLine[] = [candle, rail].map((item) => ({
      product: { id: item.id, title: item.title, handle: item.handle, thumbnail: item.thumbnail, metadata: {}, images: [] },
      variant: item.variants[0] as unknown as BundleLine["variant"],
    }))
    const button = AddBundleButton({ lines, label: "Добавить набор", disabled: false, className: "" }) as ReactElement<{
      onClick: () => void
    }>
    button.props.onClick()

    expect(cartQueue.add).toHaveBeenCalledTimes(2)
    expect(cartQueue.add).toHaveBeenNthCalledWith(1, "var_candle", 1, expect.objectContaining({ variant_id: "var_candle", product_handle: "candle-holder", unit_price: 37.99 }))
    expect(cartQueue.add).toHaveBeenNthCalledWith(2, "var_rail", 1, expect.objectContaining({ variant_id: "var_rail", unit_price: 53.99 }))
    expect(cartSidebar.open).toHaveBeenCalledTimes(1)
  })
})
