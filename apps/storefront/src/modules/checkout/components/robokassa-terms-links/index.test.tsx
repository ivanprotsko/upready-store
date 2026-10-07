import { readFileSync } from "node:fs"
import { join } from "node:path"
import { NextIntlClientProvider } from "next-intl"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import RobokassaTermsLinks from "."
import type { LegalLinkContext } from "@lib/util/legal-links"

/**
 * t-2026-10-08-13. The Robokassa contract, clause 4.3.4, asks for the payment terms where
 * the buyer sees them before paying. With Robokassa picked, the checkout links the shop's
 * delivery and payment page and its offer, and never a page the shop has not published.
 */

vi.mock("@i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const messages = JSON.parse(
  readFileSync(join(__dirname, "../../../../../messages/ru.json"), "utf8")
)

const render = (pageKeys: string[]) => {
  const legal: LegalLinkContext = { hasTenant: true, pageKeys }
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="ru" messages={messages}>
      <RobokassaTermsLinks legal={legal} />
    </NextIntlClientProvider>
  )
}

describe("RobokassaTermsLinks", () => {
  it("links the payment terms and the offer the shop has published", () => {
    const html = render(["offer", "privacy", "delivery"])

    expect(html).toMatch(
      /<a[^>]*href="\/pages\/delivery"[^>]*data-testid="robokassa-payment-terms-link"[^>]*>Условия оплаты и доставки<\/a>/
    )
    expect(html).toMatch(
      /<a[^>]*href="\/pages\/offer"[^>]*data-testid="robokassa-offer-link"[^>]*>Публичная оферта<\/a>/
    )
  })

  it("leaves out the link to a page the shop has not published", () => {
    const html = render(["offer"])

    expect(html).toContain('data-testid="robokassa-offer-link"')
    expect(html).not.toContain("robokassa-payment-terms-link")
    expect(html).not.toContain("Условия оплаты и доставки")
  })

  it("renders nothing for a shop with neither page", () => {
    expect(render(["privacy"])).toBe("")
  })
})
