import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { createTranslator } from "next-intl"
import { describe, expect, it } from "vitest"

import { metaDescription } from "./meta-description"
import {
  productFallbackDescription,
  productMetaDescription,
  type ProductDescriptionCopy,
} from "./product-description"

/**
 * t-2026-10-08-13, part A8. A product card whose owner wrote no text had no description for
 * search engines and social cards at all. The shop, the products and their texts below are
 * invented; the two catalog keys are read from the real catalogs, the way the page reads them.
 */

const MESSAGES_DIR = path.resolve(__dirname, "../../../messages")
const SHOP = "Лавка у реки"
const TITLE = "Зубная паста с мятой"

const catalog = (locale: string) =>
  JSON.parse(readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), "utf8"))

const locales = readdirSync(MESSAGES_DIR)
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.replace(/\.json$/, ""))

/** What `getProductDescriptionCopy` hands over, built from a locale's catalog. */
const copy = (locale: string): ProductDescriptionCopy => {
  const messages = catalog(locale)
  const tPage = createTranslator({ locale, messages, namespace: "TenantPage" })
  const tHome = createTranslator({ locale, messages, namespace: "Metadata.home" })

  return {
    titled: (values) => tPage("metaDescription", values),
    neutral: tHome("description"),
    siteName: SHOP,
  }
}

const FALLBACK_RU = `${TITLE} в ${SHOP}. Каталог товаров магазина, условия доставки и оплаты.`

describe("a product without a text", () => {
  it("gets its title in the shop and the shop's neutral line", () => {
    for (const description of [null, undefined, ""]) {
      expect(
        productMetaDescription({ title: TITLE, description, subtitle: null }, copy("ru"))
      ).toBe(FALLBACK_RU)
    }
  })

  it("carries no markup mark from a title typed with them", () => {
    const line = productMetaDescription(
      { title: "**Зубная паста** с *мятой* `новинка`", description: null },
      copy("ru")
    )

    expect(line).toBeDefined()
    expect(line).not.toMatch(/[*`#|<>]/)
    expect(line).toContain("Зубная паста")
    expect(line).toContain(`в ${SHOP}.`)
  })

  it("is the same two catalog keys and nothing else in every language", () => {
    expect(locales).toHaveLength(36)

    for (const locale of locales) {
      const words = copy(locale)
      const line = productFallbackDescription(TITLE, words)

      expect(line, locale).toBe(
        metaDescription(`${words.titled({ title: TITLE, siteName: SHOP })} ${words.neutral}`)
      )
      expect(line, locale).toContain(TITLE)
      expect(line, locale).toContain(SHOP)
      expect(line, locale).not.toMatch(/[{}]/)
    }
  })

  it("without a title is the shop's neutral line alone", () => {
    expect(productMetaDescription({ title: "  ", description: null }, copy("ru"))).toBe(
      "Каталог товаров магазина, условия доставки и оплаты."
    )
  })
})

describe("a product with a text", () => {
  const words = copy("ru")

  it("keeps its line character for character", () => {
    expect(
      productMetaDescription(
        { title: TITLE, description: "Мягкая паста на травах. Туба 75 мл.", subtitle: "Для всей семьи" },
        words
      )
    ).toBe("Мягкая паста на травах. Туба 75 мл.")

    const texts = [
      "<p>Мягкая   паста</p><p>на травах</p>",
      "Паста `без` фтора",
      "слово ".repeat(60),
      "  Туба 75 мл  ",
    ]

    for (const description of texts) {
      expect(productMetaDescription({ title: TITLE, description, subtitle: "Подзаголовок" }, words)).toBe(
        metaDescription(description)
      )
    }
  })

  it("keeps the order it had: the SEO override, the text, the subtitle", () => {
    expect(
      productMetaDescription(
        { title: TITLE, override: "Строка владельца", description: "Текст", subtitle: "Подзаголовок" },
        words
      )
    ).toBe("Строка владельца")
    expect(productMetaDescription({ title: TITLE, description: null, subtitle: "Подзаголовок" }, words)).toBe(
      "Подзаголовок"
    )
  })
})

describe("a product whose text is spaces alone", () => {
  it("gets the fallback line, not an empty tag", () => {
    for (const description of ["   ", " \n\t ", "<p> </p>", "  "]) {
      expect(
        productMetaDescription({ title: TITLE, description, subtitle: "  " }, copy("ru")),
        JSON.stringify(description)
      ).toBe(FALLBACK_RU)
    }
  })
})
