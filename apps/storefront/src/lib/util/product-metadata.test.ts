import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  PRODUCT_METADATA_KEYS,
  VARIANT_METADATA_KEYS,
  allowProductMetadata,
  allowVariantMetadata,
  redactProductMetadata,
} from "./product-metadata"

/**
 * t-2026-10-08-13. Ivan, 08.10.2026: «проверили содержание страниц на запрещенную
 * информацию, или на наличие цен в долларах». The owner's price list (a price in dollars
 * and the exchange rate), her marketplace links and her review marks stood in the code of
 * every page that carries a product. Every value here is made up.
 */

const SERVICE = {
  pricelist: { no: 1, rub: 100, usd: 1, rate: 100, name: "Позиция прайс-листа", source: "заметка" },
  pricelistPositions: [{ no: 1, usd: 1 }],
  wb: { wb_url: "https://www.wildberries.ru/catalog/0/detail.aspx" },
  source_url: "https://old.example.test/p/1",
  title_before_wb: "Прежнее название",
  needs_review: true,
}

const KEPT = {
  digital: "true",
  course_page: { about: [{ locale: "ru", title: "О курсе" }] },
  cover: { src: "https://cdn.test/cover.jpg", alt: "Обложка" },
  seo: { ru: { title: "Заголовок" } },
  condition: "new",
  brand: "Марка",
  mpn: "A-1",
  aspect_ratio: "3/4",
}

const product = (extra: Record<string, unknown> = {}) => ({
  id: "prod_test_1",
  title: "Мёд",
  metadata: { ...SERVICE, ...KEPT },
  ...extra,
})

const SERVICE_KEYS = Object.keys(SERVICE)

/**
 * The shape the acceptance check of 08.10.2026 read on a live product page: the price-list
 * row with the marketplace fields inside it, on the VARIANT, and `variant_images` beside it.
 */
const VARIANT_SERVICE = {
  pricelist: {
    no: 2,
    rub: 200,
    usd: 2,
    rate: 100,
    source: "заметка",
    wb_url: "https://www.wildberries.ru/catalog/0/detail.aspx",
    wb_nm_id: 1,
    ozon_group_key: "group-1",
    title_before_wb: "Прежнее название",
    needs_review: true,
  },
  variant_images: [],
  wb_nm_id: 1,
}

const variant = (extra: Record<string, unknown> = {}) => ({
  id: "variant_test_1",
  title: "250 г",
  sku: "TEST-1",
  metadata: { ...VARIANT_SERVICE },
  ...extra,
})

/** Every string the store lead's guest check of a live shop looks for (`rk-verify-live.mjs`, `LEAKS`). */
const LEAKS = [
  "pricelist",
  '"usd"',
  "wildberries",
  "title_before_wb",
  "needs_review",
  "wb_url",
  "wb_nm_id",
  "ozon_group_key",
  '"rate"',
  "variant_images",
]
const leaksOf = (value: unknown) => {
  const text = JSON.stringify(value)
  return LEAKS.filter((needle) => text.includes(needle))
}

describe("allowProductMetadata", () => {
  it("drops the owner's service keys and keeps every key the storefront reads", () => {
    const clean = allowProductMetadata(product())

    for (const key of SERVICE_KEYS) {
      expect(clean.metadata).not.toHaveProperty(key)
    }
    expect(clean.metadata).toEqual(KEPT)
    expect(clean.title).toBe("Мёд")
  })

  it("keeps exactly the keys of the list, value by value", () => {
    expect(Object.keys(KEPT).sort()).toEqual([...PRODUCT_METADATA_KEYS].sort())
    const clean = allowProductMetadata(product()) as { metadata: Record<string, unknown> }
    for (const key of PRODUCT_METADATA_KEYS) {
      expect(clean.metadata[key]).toBe(KEPT[key])
    }
  })

  it("returns a product with nothing to cut as it came", () => {
    const tidy = { id: "prod_test_2", metadata: { digital: "true" } }
    const bare = { id: "prod_test_3", metadata: null }

    expect(allowProductMetadata(tidy)).toBe(tidy)
    expect(allowProductMetadata(bare)).toBe(bare)
  })

  it("does not change the product it was given", () => {
    const original = product()
    allowProductMetadata(original)

    expect(original.metadata).toHaveProperty("pricelist")
  })
})

describe("redactProductMetadata over a Store API answer", () => {
  const leaks = (value: unknown) => {
    const text = JSON.stringify(value)
    return SERVICE_KEYS.filter((key) => text.includes(`"${key}"`)).concat(
      ["wildberries", '"usd"'].filter((needle) => text.includes(needle))
    )
  }

  it("cleans a product list, one product, a category's products and a cart line's product", () => {
    const answers = [
      { products: [product(), product({ id: "prod_test_4" })], count: 2 },
      { product: product() },
      { product_categories: [{ id: "pcat_1", metadata: { image_url: "/a.jpg" }, products: [product()] }] },
      { cart: { id: "cart_1", metadata: { pickup: "1" }, items: [{ id: "cali_1", metadata: { gift: "1" }, product: product() }] } },
      { order: { id: "order_1", items: [{ id: "ordli_1", variant: { id: "variant_1", product: product() } }] } },
    ]

    for (const answer of answers) {
      expect(leaks(answer).length).toBeGreaterThan(0)
      expect(leaks(redactProductMetadata(answer))).toEqual([])
    }
  })

  it("cleans a product whose id the query left out, by the key it stands under", () => {
    const { id: _id, ...withoutId } = product()

    expect(leaks(redactProductMetadata({ products: [withoutId] }))).toEqual([])
    expect(leaks(redactProductMetadata({ items: [{ product: withoutId }] }))).toEqual([])
  })

  it("leaves the metadata of everything that is not a product alone", () => {
    const answer = {
      cart: {
        id: "cart_1",
        metadata: { pricelist: "the cart's own key" },
        items: [{ id: "cali_1", metadata: { wb: "the line's own key" } }],
      },
      product_categories: [{ id: "pcat_1", metadata: { image_url: "/a.jpg", image_alt: "Мёд" } }],
      shipping_options: [{ id: "so_1", metadata: { delivery_days_min: 2 } }],
    }

    expect(redactProductMetadata(answer)).toBe(answer)
  })

  it("keeps a product's option values and their metadata, and a variant with nothing to cut", () => {
    const parts = {
      variants: [{ id: "variant_1", metadata: null }, { id: "variant_2", metadata: {} }],
      options: [{ id: "opt_1", values: [{ id: "optval_1", metadata: { hex: "#fff" } }] }],
    }
    const answer = { product: { ...product(), ...parts } }
    const clean = redactProductMetadata(answer)

    expect(clean.product.variants).toBe(answer.product.variants)
    expect(clean.product.options).toBe(answer.product.options)
    expect(clean.product.metadata).toEqual(KEPT)
  })

  it("returns an answer with nothing to cut by identity, and passes plain values through", () => {
    const answer = { products: [{ id: "prod_test_5", metadata: { digital: "true" } }], count: 1 }

    expect(redactProductMetadata(answer)).toBe(answer)
    expect(redactProductMetadata(null)).toBeNull()
    expect(redactProductMetadata("text")).toBe("text")
  })
})

describe("a variant's metadata", () => {
  it("has no key the storefront reads, so the list is empty", () => {
    expect(VARIANT_METADATA_KEYS).toEqual([])
  })

  it("drops pricelist, variant_images and wb_nm_id from one variant and keeps the variant", () => {
    const clean = allowVariantMetadata(variant())

    for (const key of ["pricelist", "variant_images", "wb_nm_id"]) {
      expect(clean.metadata).not.toHaveProperty(key)
    }
    expect(clean.metadata).toEqual({})
    expect(clean.sku).toBe("TEST-1")
    expect(clean.title).toBe("250 г")
  })

  it("does not change the variant it was given, and returns a tidy one as it came", () => {
    const original = variant()
    allowVariantMetadata(original)
    const tidy = { id: "variant_test_2", metadata: {} }
    const bare = { id: "variant_test_3", metadata: null }

    expect(original.metadata).toHaveProperty("pricelist")
    expect(allowVariantMetadata(tidy)).toBe(tidy)
    expect(allowVariantMetadata(bare)).toBe(bare)
  })

  it("is cut wherever a Store API answer carries a variant", () => {
    const optionValue = { id: "optval_1", value: "250 г", metadata: { hex: "#fff" } }
    const withVariants = (extra: Record<string, unknown> = {}) =>
      product({ variants: [variant({ options: [optionValue] }), variant({ id: "variant_test_4" })], ...extra })
    const answers = [
      { products: [withVariants(), withVariants({ id: "prod_test_6" })], count: 2 },
      { product: withVariants() },
      { product_categories: [{ id: "pcat_1", metadata: { image_url: "/a.jpg" }, products: [withVariants()] }] },
      {
        cart: {
          id: "cart_1",
          metadata: { pickup: "1" },
          items: [
            {
              id: "cali_1",
              metadata: { gift: "1" },
              product: withVariants(),
              variant: variant({ product: withVariants() }),
            },
          ],
        },
      },
      { order: { id: "order_1", metadata: { pickup: "1" }, items: [{ id: "ordli_1", metadata: { gift: "1" }, variant: variant(), product: product() }] } },
      { orders: [{ id: "order_2", items: [{ id: "ordli_2", variant: variant({ product: withVariants() }) }] }] },
      { wishlist: { items: [{ id: "wli_1", product: withVariants() }] } },
      { variants: [variant()] },
      { variant: variant() },
    ]

    for (const answer of answers) {
      expect(leaksOf(answer).length).toBeGreaterThan(0)
      expect(leaksOf(redactProductMetadata(answer))).toEqual([])
    }
  })

  it("is cut on a variant whose id the query left out, by the key it stands under", () => {
    const { id: _id, ...withoutId } = variant()

    expect(leaksOf(redactProductMetadata({ items: [{ variant: withoutId }] }))).toEqual([])
    expect(leaksOf(redactProductMetadata({ product: { title: "Мёд", variants: [withoutId] } }))).toEqual([])
  })

  it("is cut by the variant's id under a key of any other name", () => {
    expect(leaksOf(redactProductMetadata({ results: [variant()] }))).toEqual([])
  })

  it("leaves the line's and the cart's own metadata, the option value and the variant's fields alone", () => {
    const optionValue = { id: "optval_1", value: "250 г", metadata: { hex: "#fff" } }
    const lineVariant = {
      ...variant(),
      options: [optionValue],
      images: [{ id: "img_1", url: "/a.jpg", metadata: null }],
    }
    const line = {
      id: "cali_1",
      variant_id: "variant_test_1",
      metadata: { gift: "1", pricelist: "the line's own key" },
      variant: lineVariant,
    }
    const answer = { cart: { id: "cart_1", metadata: { pickup_point_id: "p1" }, items: [line] } }
    const clean = redactProductMetadata(answer)
    const cleanLine = clean.cart.items[0]

    expect(clean.cart.metadata).toBe(answer.cart.metadata)
    expect(cleanLine.metadata).toBe(line.metadata)
    expect(cleanLine.variant_id).toBe("variant_test_1")
    expect(cleanLine.variant.metadata).toEqual({})
    expect(cleanLine.variant.sku).toBe("TEST-1")
    expect(cleanLine.variant.options).toBe(lineVariant.options)
    expect(cleanLine.variant.images).toBe(lineVariant.images)
  })
})

describe("lib/config.ts: every Store API answer passes the cut", () => {
  it("wraps both readers", () => {
    const config = readFileSync(join(__dirname, "../config.ts"), "utf8")

    expect(config.match(/redactProductMetadata\(\s*redactMigrationMetadata\(/g)).toHaveLength(2)
  })
})
