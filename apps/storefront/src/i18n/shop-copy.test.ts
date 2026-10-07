import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { locales } from "./config"

/**
 * The starter's own copy that a shop's visitor, a search engine or a payment
 * provider's moderator used to read on a shop (t-2026-10-08-13): the home
 * page's description, the block under the account pages, the empty cart and
 * two untranslated labels of the checkout. The whole catalog of a locale also
 * travels into every page's HTML, so a string no component reads is still
 * read by whoever opens the page source.
 */

const MESSAGES_DIR = path.resolve(__dirname, "../../messages")
const SRC = path.resolve(__dirname, "..")

type Catalog = { [key: string]: string | Catalog }

const catalog = (locale: string): Catalog =>
  JSON.parse(readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), "utf8"))

const read = (messages: Catalog, key: string): unknown =>
  key.split(".").reduce<unknown>(
    (node, part) => (node && typeof node === "object" ? (node as Catalog)[part] : undefined),
    messages
  )

const values = (messages: Catalog): string[] =>
  Object.values(messages).flatMap((value) => (typeof value === "object" ? values(value) : [value]))

const source = (file: string) => readFileSync(path.join(SRC, file), "utf8")

describe("the Russian catalog", () => {
  const ru = catalog("ru")

  it.each([
    ["Metadata.home.description", "Каталог товаров магазина, условия доставки и оплаты."],
    ["AccountLayout.shopQuestions", "Вопросы по заказу задайте по контактам магазина."],
    ["AccountLayout.contacts", "Контакты"],
    ["CheckoutPage.fieldEmail", "Электронная почта"],
    ["CheckoutPage.giftCard", "Подарочная карта"],
    ["Cart.emptyMessage", "Корзина пуста. Загляните в каталог."],
  ])("%s reads «%s»", (key, text) => {
    expect(read(ru, key)).toBe(text)
  })
})

describe("every catalog", () => {
  const english = catalog("en")

  it("describes the home page in words that are true for any shop", () => {
    expect(read(english, "Metadata.home.description")).toBe(
      "The shop's product catalog, delivery and payment terms."
    )
  })

  it.each([...locales])("%s: the home description is translated, not copied", (code) => {
    const text = read(catalog(code), "Metadata.home.description")

    expect(typeof text === "string" && text.trim().length > 0).toBe(true)
    if (code !== "en") {
      expect(text).not.toBe(read(english, "Metadata.home.description"))
    }
  })

  it.each([...locales])("%s: no value names the starter", (code) => {
    expect(values(catalog(code)).filter((value) => /medusa dtc/i.test(value))).toEqual([])
  })
})

describe("the pages that use these rules", () => {
  it("the home page takes its description from homeDescription", () => {
    expect(source("app/[locale]/(main)/page.tsx")).toContain("description: homeDescription(")
  })

  it("the account layout takes its text and link from accountSupport", () => {
    const layout = source("modules/account/templates/account-layout.tsx")

    expect(layout).toContain("accountSupport(legal)")
    expect(layout).toContain("t(support.text)")
    expect(layout).toContain("t(support.label)")
    expect(layout).not.toContain('t("faqDescription")')
  })

  it("a shop's social picture and its alt come from the shop, on both routes", () => {
    expect(source("app/[locale]/layout.tsx")).toContain("buildSocialImageMetadata(handle ? shopName : null)")

    for (const route of ["app/opengraph-image.tsx", "app/twitter-image.tsx"]) {
      expect(source(route)).toContain("socialImageSource(")
      expect(source(route)).toContain("renderSocialCard(")
    }
  })
})
