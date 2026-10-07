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

    expect(html).toContain(
      `data-testid="footer-requisites-line">ИП Иванова Мария Петровна · ОГРНИП ${SOLE_TRADER_NUMBER} · ИНН ${TAX_NUMBER} · 170000, г. Тверь, ул. Примерная, д. 1</p>`
    )
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

describe("Olavka footer: the Robokassa mark", { timeout: 30_000 }, () => {
  it("shows the mark, the link and the note for a shop that connected Robokassa", async () => {
    paymentMethods = { ...EMPTY_TENANT_PAYMENT_METHODS, robokassa: true, demo: false }
    const html = await render()

    expect(html).toMatch(
      /<a href="https:\/\/robokassa\.com\/" target="_blank" rel="noopener"[^>]*data-testid="footer-robokassa-link">Robokassa<\/a>/
    )
    expect(html).toContain("Оплата картой и через СБП. Платежи принимает Robokassa")
    // The mark does not bring the requisites with it.
    expect(html).not.toContain("footer-requisites-line")
    expect(html).not.toContain("Иванова")
  })

  it("stands in the same row as the requisites when both are there", async () => {
    vi.stubEnv("STOREFRONT_FOOTER_REQUISITES", "1")
    paymentMethods = { ...EMPTY_TENANT_PAYMENT_METHODS, robokassa: true, demo: false }
    const html = await render()
    const row = html.match(UNDER_COLUMNS)?.[0] ?? ""

    expect(row).toContain("footer-robokassa-link")
    expect(row).toContain("footer-requisites-line")
    expect(html.match(/footer-olavka-under-columns/g)).toHaveLength(1)
  })
})
