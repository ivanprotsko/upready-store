import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createTranslator } from "next-intl"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { TenantSeller } from "@lib/data/tenant-seller"
import {
  EMPTY_TENANT_PAYMENT_METHODS,
  type TenantPaymentMethods,
} from "@lib/tenant/payment-methods"

/**
 * t-2026-10-08-13. Ivan, 08.10.2026: «нам нужно будет отправить cherkashino.ru на модерацию
 * в robokassa.ru … ошибки быть не должно». Robokassa looks for the seller's requisites in
 * the footer and for its own mark with a link. Ivan, 03.10: «никаких ссылок на ИП Черкашина
 * и т.д. Быть не должно», so the requisites stand behind `STOREFRONT_FOOTER_REQUISITES` and
 * the footer without it is the footer as it was.
 *
 * The loaders are replaced, the component is the real one. Every name and number is made up.
 */

const messages = JSON.parse(
  readFileSync(join(__dirname, "../../../../../../messages/ru.json"), "utf8")
)

const SOLE_TRADER_NUMBER = "300000000000001"
const TAX_NUMBER = "000000000001"

const SELLER: TenantSeller = {
  name: "Лавка",
  legal_name: "Иванова Мария Петровна",
  inn: TAX_NUMBER,
  ogrn: SOLE_TRADER_NUMBER,
  legal_address: "170000, г. Тверь, ул. Примерная, д. 1",
  phone: null,
  email: null,
}

let seller: TenantSeller | null = SELLER
let paymentMethods: TenantPaymentMethods = EMPTY_TENANT_PAYMENT_METHODS

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({ locale: "ru", messages, namespace }),
}))
vi.mock("@i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock("@lib/data/attribution", () => ({ getSiteAttribution: async () => null }))
vi.mock("@lib/data/categories", () => ({
  listCategories: async () => [
    { id: "pcat_1", handle: "honey", name: "Мёд", parent_category_id: null },
  ],
}))
vi.mock("@lib/data/cookies", () => ({ getSiteName: async () => "Лавка" }))
vi.mock("@lib/data/legal-links", () => ({
  getLegalLinkContext: async () => ({ hasTenant: true, pageKeys: ["offer", "privacy", "delivery"] }),
}))
vi.mock("@lib/data/tenant-pages", () => ({
  listTenantPages: async () => [
    { key: "delivery", title: "Доставка и оплата" },
    { key: "offer", title: "Публичная оферта" },
    { key: "privacy", title: "Политика конфиденциальности" },
  ],
}))
vi.mock("@lib/data/tenant-seller", () => ({ getTenantSeller: async () => seller }))
vi.mock("@lib/data/tenant-payment-methods", () => ({
  getSitePaymentMethods: async () => paymentMethods,
}))
// The product card pulls the whole catalog UI in; the footer takes one class string from it.
vi.mock("@modules/products/components/product-card", () => ({ PRODUCT_GRID_CLASS: "grid" }))
// The contacts are an async component of their own and are not what this suite is about.
vi.mock("@modules/layout/components/footer-seller", () => ({ FooterContacts: () => null }))

const render = async () => {
  const { default: FooterOlavka } = await import("./olavka")
  return renderToStaticMarkup(await FooterOlavka())
}

/** The row under the columns, cut out of the markup: what the switch and Robokassa add. */
const UNDER_COLUMNS = /<div class="grid mt-10" data-testid="footer-olavka-under-columns">.*?<\/div><\/div>/

afterEach(() => {
  vi.unstubAllEnvs()
  seller = SELLER
  paymentMethods = EMPTY_TENANT_PAYMENT_METHODS
})

describe("Olavka footer: the requisites line behind the switch", { timeout: 30_000 }, () => {
  it("prints no requisites and no Robokassa mark without the switch", async () => {
    const html = await render()

    expect(html).not.toContain("footer-olavka-under-columns")
    expect(html).not.toContain("footer-requisites-line")
    expect(html).not.toContain("footer-robokassa")
    expect(html).not.toContain("Иванова")
    expect(html).not.toContain(SOLE_TRADER_NUMBER)
    expect(html).not.toContain(TAX_NUMBER)
    expect(html).not.toContain("Тверь")
    expect(html).not.toContain("ОГРНИП")
    expect(html).not.toContain("Robokassa")
  })

  it("prints nothing for a value that is not 1 or true", async () => {
    vi.stubEnv("STOREFRONT_FOOTER_REQUISITES", "0")

    expect(await render()).not.toContain("footer-requisites-line")
  })

  it("prints the name with «ИП», the ОГРНИП, the ИНН and the address with the switch", async () => {
    vi.stubEnv("STOREFRONT_FOOTER_REQUISITES", "1")
    const html = await render()

    // t-2026-10-09-76, Ivan 09.10: «вместо булетов поставить запятые, а после аббревиатур
    // двоеточие». The full name stays: Robokassa asks for «ИП ФИО (полностью)».
    expect(html).toContain(
      `data-testid="footer-requisites-line">ИП Иванова Мария Петровна, ОГРНИП: ${SOLE_TRADER_NUMBER}, ИНН: ${TAX_NUMBER}, 170000, г. Тверь, ул. Примерная, д. 1</p>`
    )
    expect(html).not.toContain(" · ")
  })

  it("prints the line in capitals, smaller than the footer's links", async () => {
    vi.stubEnv("STOREFRONT_FOOTER_REQUISITES", "1")
    const html = await render()
    const classes = html.match(/<p class="([^"]*)" data-testid="footer-requisites-line">/)?.[1].split(" ")

    // Ivan 09.10: «написать все прописными буквами и уменьшить». The capitals come from CSS, so
    // the text itself keeps the owner's case for a screen reader and for a copy.
    expect(classes).toContain("uppercase")
    // 12 px against the 14 px of `txt-compact-medium`, the size of the footer's links.
    expect(classes).toContain("txt-compact-xsmall")
    expect(html).toContain('class="txt-compact-medium text-ui-fg-subtle')
  })

  it("adds one row under the columns and changes nothing else", async () => {
    const without = await render()
    vi.stubEnv("STOREFRONT_FOOTER_REQUISITES", "1")
    const withSwitch = await render()

    expect(withSwitch).not.toBe(without)
    expect(withSwitch.replace(UNDER_COLUMNS, "")).toBe(without)
  })

  it("prints no empty row for a seller with no requisites", async () => {
    vi.stubEnv("STOREFRONT_FOOTER_REQUISITES", "1")
    seller = { ...SELLER, legal_name: null, inn: null, ogrn: null, legal_address: null }

    expect(await render()).not.toContain("footer-olavka-under-columns")
  })
})

/** The marks in the row, in the order they stand: the `src` of every image. */
const markSources = (html: string) =>
  Array.from(
    (html.match(/<ul[^>]*data-testid="footer-payment-marks">.*?<\/ul>/)?.[0] ?? "").matchAll(/<img src="([^"]+)"/g),
    (match) => match[1]
  )

const MARK_FILES = ["mir", "visa", "mastercard", "sbp"] as const

const readMark = (name: string) =>
  readFileSync(join(__dirname, `../../../../../../public/payment/${name}.svg`), "utf8")

describe("Olavka footer: the Robokassa mark and the payment marks", { timeout: 30_000 }, () => {
  it("keeps the Robokassa logo as the link to robokassa.com, for a shop that connected Robokassa", async () => {
    paymentMethods = { ...EMPTY_TENANT_PAYMENT_METHODS, robokassa: true, demo: false }
    const html = await render()
    const link = html.match(
      /<a href="https:\/\/robokassa\.com\/" target="_blank" rel="noopener"[^>]*data-testid="footer-robokassa-link">(.*?)<\/a>/
    )

    // The contract, clause 4.3.4: «логотип Системы и соответствующую гипертекстовую ссылку».
    expect(link?.[1]).toMatch(
      /^<img src="\/payment\/robokassa\.svg" alt="Robokassa" width="161" height="24" class="h-5 w-auto"\/>$/
    )
    // The mark does not bring the requisites with it.
    expect(html).not.toContain("footer-requisites-line")
    expect(html).not.toContain("Иванова")
  })

  it("drops the sentence about card, SBP and Robokassa", async () => {
    paymentMethods = { ...EMPTY_TENANT_PAYMENT_METHODS, robokassa: true, demo: false }
    const html = await render()

    // Ivan 09.10: «вот это "Оплата картой и через СБП. Платежи принимает Robokassa" особенно
    // раздражает, с учетом того, что есть логотип робокасса». No source asks for it.
    expect(html).not.toContain("Оплата картой")
    expect(html).not.toContain("Платежи принимает")
    expect(messages.Footer).not.toHaveProperty("robokassaNote")
  })

  it("puts the marks of Мир, Visa, Mastercard and СБП beside the Robokassa logo, in one row", async () => {
    paymentMethods = { ...EMPTY_TENANT_PAYMENT_METHODS, robokassa: true, demo: false }
    const html = await render()

    // Ivan 09.10: «Раз логотипы нужно размещать тогда уже стоит и логотипа други систем».
    expect(markSources(html)).toEqual([
      "/payment/robokassa.svg",
      "/payment/mir.svg",
      "/payment/visa.svg",
      "/payment/mastercard.svg",
      "/payment/sbp.svg",
    ])
    for (const [name, alt] of [
      ["mir", "Мир"],
      ["visa", "Visa"],
      ["mastercard", "Mastercard"],
      ["sbp", "СБП"],
    ]) {
      expect(html).toMatch(new RegExp(`<img src="/payment/${name}\\.svg" alt="${alt}" width="\\d+" height="\\d+" class="h-5 w-auto"/>`))
    }
  })

  it("draws every mark on the same plate at the same height", async () => {
    paymentMethods = { ...EMPTY_TENANT_PAYMENT_METHODS, robokassa: true, demo: false }
    const html = await render()
    const row = html.match(/<ul[^>]*data-testid="footer-payment-marks">.*?<\/ul>/)?.[0] ?? ""
    const plates = Array.from(
      row.matchAll(/<li [^>]*class="([^"]*)"[^>]*data-testid="footer-payment-plate"/g),
      (match) => match[1]
    )
    const images = Array.from(row.matchAll(/<img [^>]*class="([^"]*)"/g), (match) => match[1])

    expect(plates).toHaveLength(5)
    expect(new Set(plates).size).toBe(1)
    // The plate stays light in the dark theme: the marks are the owners' full-colour files.
    expect(plates[0]).toContain("bg-[var(--payment-mark-plate)]")
    expect(images).toEqual(Array(5).fill("h-5 w-auto"))
  })

  it("shows no mark for a shop without Robokassa, as on cherkashino.com", async () => {
    vi.stubEnv("STOREFRONT_FOOTER_REQUISITES", "1")
    const html = await render()

    expect(html).not.toContain("footer-payment-marks")
    expect(html).not.toContain("/payment/")
    expect(html).toContain("footer-requisites-line")
  })

  it("ships the logo file the image points at: Robokassa's own, with nothing loaded from outside", () => {
    const svg = readFileSync(join(__dirname, "../../../../../../public/payment/robokassa.svg"), "utf8")

    expect(svg).toMatch(/^<svg width="161" height="24" viewBox="0 0 161 24"/)
    expect(svg).not.toMatch(/<script|<image|<use|\son[a-z]+=|href=|url\(\s*['"]?https?:/i)
  })

  it.each(MARK_FILES)("ships %s.svg: an SVG with its own size, nothing loaded from outside", (name) => {
    const svg = readMark(name)

    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="[\d.]+" height="[\d.]+" viewBox="[-\d. ]+"/)
    expect(svg).not.toMatch(/<script|<image|<use|\son[a-z]+=|href=|url\(\s*['"]?https?:/i)
  })

  it("keeps each mark in its owner's colours", () => {
    // Visa: «must be displayed in Visa Blue when the screen … supports full color».
    expect(readMark("visa")).toContain('fill="#1434CB"')
    // Mastercard: «The Mastercard Symbol must never be used in grayscale or other colors».
    for (const colour of ["#ff5f00", "#eb001b", "#f79e1b"]) {
      expect(readMark("mastercard")).toContain(colour)
    }
  })

  it("stands in the same row as the requisites when both are there", async () => {
    vi.stubEnv("STOREFRONT_FOOTER_REQUISITES", "1")
    paymentMethods = { ...EMPTY_TENANT_PAYMENT_METHODS, robokassa: true, demo: false }
    const html = await render()
    const row = html.match(UNDER_COLUMNS)?.[0] ?? ""

    expect(row).toContain("footer-robokassa-link")
    expect(row).toContain("footer-payment-marks")
    expect(row).toContain("footer-requisites-line")
    expect(html.match(/footer-olavka-under-columns/g)).toHaveLength(1)
  })
})
