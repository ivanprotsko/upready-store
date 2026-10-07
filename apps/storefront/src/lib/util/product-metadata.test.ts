import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  PRODUCT_METADATA_KEYS,
  allowProductMetadata,
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

  it("keeps a product's own parts: variants, option values and their metadata", () => {
    const parts = {
      variants: [{ id: "variant_1", metadata: { note: "kept" } }],
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

describe("lib/config.ts: every Store API answer passes the cut", () => {
  it("wraps both readers", () => {
    const config = readFileSync(join(__dirname, "../config.ts"), "utf8")

    expect(config.match(/redactProductMetadata\(\s*redactMigrationMetadata\(/g)).toHaveLength(2)
  })
})
