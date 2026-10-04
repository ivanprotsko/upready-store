import { readFileSync } from "node:fs"
import { join } from "node:path"
import { NextIntlClientProvider, createTranslator } from "next-intl"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

/**
 * t-2026-10-04-48. No payment return lands on the cart any more, but links to
 * `/cart?error=…` already sent still render this banner. Ivan's test showed
 * «Платёж не прошёл» over «Оплата ещё подтверждается»: a payment being confirmed
 * has its own heading now.
 */

const messages = JSON.parse(
  readFileSync(join(__dirname, "../../../../../messages/ru.json"), "utf8")
)

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({ locale: "ru", messages, namespace }),
}))
vi.mock("@lib/data/legal-links", () => ({
  getLegalLinkContext: async () => ({ hasTenant: true, pageKeys: [] }),
}))
vi.mock("@i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const render = async (error: string) => {
  const { default: OrderErrorBanner } = await import(".")
  const element = await OrderErrorBanner({ error })
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="ru" messages={messages}>
      {element}
    </NextIntlClientProvider>
  )
}

// The first import pulls the banner and `@medusajs/ui` in; under a full parallel run it
// outlasts vitest's default 5 s (timed out once on dev ab068501), as `payment-return/page.test.tsx` notes.
describe("OrderErrorBanner on old /cart?error=… links", { timeout: 30_000 }, () => {
  it("heads payment_pending «Оплата подтверждается», not «Платёж не прошёл»", async () => {
    const html = await render("payment_pending")

    expect(html).toContain('data-value="payment_pending"')
    expect(html).toContain("Оплата подтверждается")
    expect(html).not.toContain("Платёж не прошёл")
    expect(html).toContain("bg-ui-tag-orange-bg")
  })

  it.each(["payment_failed", "order_failed"])("keeps «Платёж не прошёл» for %s", async (error) => {
    const html = await render(error)

    expect(html).toContain("Платёж не прошёл")
    expect(html).toContain("bg-ui-tag-red-bg")
  })

  it("renders nothing for an unknown value", async () => {
    const { default: OrderErrorBanner } = await import(".")
    expect(await OrderErrorBanner({ error: "<script>" })).toBeNull()
  })
})
