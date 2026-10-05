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

const render = (notice: PaymentReturnNotice | null, locale = "ru", forCart = cart) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages(locale)}>
      <RobokassaRetryNotice cart={forCart} notice={notice} />
    </NextIntlClientProvider>
  )

const btcpayCart = (status: string, data: Record<string, unknown>) =>
  ({
    id: "cart_2",
    completed_at: null,
    payment_collection: {
      payment_sessions: [{ provider_id: "pp_btcpay_btcpay", status, data }],
    },
  }) as unknown as HttpTypes.StoreCart

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
    expect(html).toContain("bg-status-warning-bg")
    expect(html).not.toContain("bg-status-error-bg")
  })

  it("renders English from the en catalog", () => {
    expect(render("pending", "en")).toContain("Payment is being confirmed")
    expect(render("failed", "en")).toContain("Payment didn&#x27;t go through")
  })

  it("renders nothing on the first paint without a notice (the local mark is read after mount)", () => {
    expect(render(null)).toBe("")
  })
})

/**
 * ask-20261005-070255-438f: a buyer back from BTCPay. The same `pending` from
 * the waiting page means one of two things, and the cart's BTCPay session says
 * which: a transfer the network has not confirmed, or an invoice that expired
 * with nothing paid.
 */
describe("RobokassaRetryNotice for a buyer back from BTCPay", () => {
  it("speaks of the network, not the bank, while the transfer is being confirmed", () => {
    const html = render(
      "pending",
      "ru",
      btcpayCart("pending", { invoice_status: "Processing", expires_at: "2099-01-01T00:00:00.000Z" })
    )

    expect(html).toContain('data-testid="payment-pending-notice"')
    expect(html).toContain("Оплата подтверждается")
    expect(html).toContain("Сеть ещё не подтвердила ваш перевод")
    expect(html).not.toContain("Банк")
  })

  it("says the invoice expired, in red, and leads to the payment block for a new one", () => {
    const html = render("pending", "en", btcpayCart("canceled", { invoice_status: "Expired", additional_status: "None" }))

    expect(html).toContain('data-testid="crypto-invoice-expired-notice"')
    expect(html).toContain("The invoice has expired")
    expect(html).toContain("bg-status-error-bg")
    expect(html).not.toContain("being confirmed")
  })

  it("never tells a buyer whose partial payment arrived to pay again", () => {
    const html = render(
      "pending",
      "en",
      btcpayCart("requires_more", { invoice_status: "Expired", additional_status: "PaidPartial" })
    )

    expect(html).toContain('data-testid="payment-pending-notice"')
    expect(html).not.toContain("pay again to get a new invoice")
  })
})
