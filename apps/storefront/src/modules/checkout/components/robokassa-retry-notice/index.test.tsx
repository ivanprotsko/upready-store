import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { HttpTypes } from "@medusajs/types"
import { NextIntlClientProvider } from "next-intl"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import RobokassaRetryNotice from "."
import type { PaymentReturnNotice } from "@lib/util/robokassa-return"

/**
 * t-2026-10-04-48. A buyer back from Robokassa lands on the checkout itself with
 * `?payment=failed|pending`; the notice at the top of the form says which, in
 * words that fit: a pending payment is «Оплата подтверждается», never «не прошла».
 */

vi.mock("@i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const messages = (locale: string) =>
  JSON.parse(readFileSync(join(__dirname, `../../../../../messages/${locale}.json`), "utf8"))

const cart = {
  id: "cart_1",
  completed_at: null,
  payment_collection: {
    payment_sessions: [{ provider_id: "pp_robokassa_robokassa", status: "pending" }],
  },
} as unknown as HttpTypes.StoreCart

const render = (notice: PaymentReturnNotice | null, locale = "ru") =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages(locale)}>
      <RobokassaRetryNotice cart={cart} notice={notice} />
    </NextIntlClientProvider>
  )

describe("RobokassaRetryNotice with Robokassa's own answer", () => {
  it("names a failed payment and says the order details are kept", () => {
    const html = render("failed")

    expect(html).toContain('data-testid="robokassa-retry-notice"')
    expect(html).toContain('data-value="failed"')
    expect(html).toContain("Оплата не прошла")
    expect(html).toContain(
      "Данные заказа сохранены: попробуйте ещё раз или выберите другой способ оплаты."
    )
    expect(html).toContain("К оплате")
  })

  it("calls a pending payment «being confirmed», never «failed», and offers to check again", () => {
    const html = render("pending")

    expect(html).toContain('data-testid="payment-pending-notice"')
    expect(html).toContain("Оплата подтверждается")
    expect(html).not.toContain("не прошла")
    expect(html).not.toContain("Платёж не прошёл")
    expect(html).toContain('href="/payment-return"')
    expect(html).toContain("Проверить ещё раз")
    // Amber for a wait, not the red of an error.
    expect(html).toContain("bg-ui-tag-orange-bg")
    expect(html).not.toContain("bg-ui-tag-red-bg")
  })

  it("renders English from the en catalog", () => {
    expect(render("pending", "en")).toContain("Payment is being confirmed")
    expect(render("failed", "en")).toContain("Payment didn&#x27;t go through")
  })

  it("renders nothing on the first paint without a notice (the local mark is read after mount)", () => {
    expect(render(null)).toBe("")
  })
})
