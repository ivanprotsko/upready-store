import { readFileSync } from "node:fs"
import { join } from "node:path"
import { NextIntlClientProvider, createTranslator } from "next-intl"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { EMPTY_BRANDING, type TenantBranding } from "@lib/tenant/branding"

/**
 * t-2026-10-04-48. Ivan: «надо добавить логотип и какую-то надпись сейчас вы будете
 * перенаправлены обратно в магазин, если это не происходит — нажмите "Вернуться в
 * магазин"». The page Robokassa's success return lands on shows the shop's logo,
 * the words and the link from the first paint, before any order lookup.
 */

const messages = JSON.parse(readFileSync(join(__dirname, "../../../../messages/ru.json"), "utf8"))
let branding: TenantBranding = EMPTY_BRANDING

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({ locale: "ru", messages, namespace }),
  getLocale: async () => "ru",
}))
vi.mock("@lib/data/cookies", () => ({ getSiteName: async () => "Черкашино" }))
vi.mock("@lib/data/tenant-branding", () => ({ getSiteBranding: async () => branding }))
vi.mock("@lib/util/page-title", () => ({ pageTitle: async (title: string) => title }))
vi.mock("@i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={`/ru${href}`} {...rest}>
      {children}
    </a>
  ),
}))
const waiting = vi.fn()
vi.mock("@modules/checkout/components/payment-return-waiting", () => ({
  default: (props: { checkoutHref: string }) => {
    waiting(props)
    return null
  },
}))

const render = async () => {
  const { default: PaymentReturnPage } = await import("./page")
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="ru" messages={messages}>
      {await PaymentReturnPage()}
    </NextIntlClientProvider>
  )
}

// The first import pulls the page and `@medusajs/ui` in; under a full parallel run it outlasts
// vitest's default 5 s.
describe("[locale]/payment-return, the Robokassa waiting page", { timeout: 30_000 }, () => {
  it("shows the shop's logo, the wait message and the way back at once", async () => {
    branding = { ...EMPTY_BRANDING, logo_light_url: "https://cdn.test/logo.svg" }
    const html = await render()

    expect(html).toContain('src="https://cdn.test/logo.svg"')
    expect(html).toContain("Проверяем оплату")
    expect(html).toContain("Сейчас вернём вас в магазин.")
    expect(html).toContain("Если этого не произошло, нажмите «Вернуться в магазин».")
    expect(html).toMatch(
      /<a[^>]*href="\/ru\/checkout\?payment=pending"[^>]*data-testid="payment-return-back-link"[^>]*>Вернуться в магазин<\/a>/
    )
  })

  it("falls back to the shop's name when it has no logo", async () => {
    branding = EMPTY_BRANDING
    const html = await render()

    expect(html).toContain("Черкашино")
    expect(html).not.toContain("<img")
  })

  it("starts the order lookup with the checkout to fall back to", async () => {
    await render()

    expect(waiting).toHaveBeenCalledWith({ checkoutHref: "/ru/checkout?payment=pending" })
  })
})
