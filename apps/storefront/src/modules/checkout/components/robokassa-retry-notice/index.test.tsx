import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { HttpTypes } from "@medusajs/types"
import { NextIntlClientProvider } from "next-intl"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import RobokassaRetryNotice from "."
import { EMPTY_MANUAL_PAYMENT } from "@lib/tenant/manual-payment"
import { EMPTY_TENANT_PAYMENT_METHODS } from "@lib/tenant/payment-methods"
import { clientMessageFacts, clientMessages } from "@lib/util/client-messages"
import { EMPTY_PAYMENT_PRE_NOTICE } from "@lib/util/payment-pre-notice"
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
const bitcartCart = (status: string, data: Record<string, unknown>) =>
  ({
    id: "cart_3",
    completed_at: null,
    payment_collection: {
      payment_sessions: [{ provider_id: "pp_bitcart_bitcart", status, data }],
    },
  }) as unknown as HttpTypes.StoreCart

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

/** Stage 2 of the same task: a buyer back from Bitcart gets the same two answers from Bitcart's own statuses. */
describe("RobokassaRetryNotice for a buyer back from Bitcart", () => {
  it("speaks of the network while the transfer is being confirmed", () => {
    const html = render(
      "pending",
      "ru",
      bitcartCart("pending", { invoice_status: "confirmed", expires_at: "2099-01-01T00:00:00.000Z" })
    )

    expect(html).toContain('data-testid="payment-pending-notice"')
    expect(html).toContain("Сеть ещё не подтвердила ваш перевод")
  })

  it("says the invoice expired when nothing was paid, and never so after a partial payment", () => {
    const expired = render("pending", "en", bitcartCart("canceled", { invoice_status: "expired", exception_status: "none" }))
    expect(expired).toContain('data-testid="crypto-invoice-expired-notice"')

    const partial = render(
      "pending",
      "en",
      bitcartCart("requires_more", { invoice_status: "expired", exception_status: "paid_partial" })
    )
    expect(partial).toContain('data-testid="payment-pending-notice"')
    expect(partial).not.toContain("pay again to get a new invoice")
  })
})

/**
 * t-2026-10-08-13, part A6b. The browser of a shop without BTCPay and Bitcart gets a
 * dictionary without the three keys of the invoice wording (`lib/util/client-messages.ts`).
 * A cart can still hold an invoice session from the time the shop had the gateway: the
 * notice must not print the name of a key then.
 */
describe("RobokassaRetryNotice with the dictionary of a shop that takes Robokassa alone", () => {
  const dictionary = clientMessages(
    messages("ru"),
    clientMessageFacts({
      shop: true,
      paymentMethods: { ...EMPTY_TENANT_PAYMENT_METHODS, robokassa: true, demo: false },
      manualPayment: EMPTY_MANUAL_PAYMENT,
      analytics: { yandexMetricaId: null, ga4MeasurementId: null },
      onboarding: false,
      paymentPreNotice: EMPTY_PAYMENT_PRE_NOTICE,
      catalogViewControls: false,
    })
  )
  const renderCut = (notice: PaymentReturnNotice | null, forCart = cart) =>
    renderToStaticMarkup(
      <NextIntlClientProvider locale="ru" messages={dictionary}>
        <RobokassaRetryNotice cart={forCart} notice={notice} />
      </NextIntlClientProvider>
    )

  it("has no key of the invoice wording, which is what the cases below stand on", () => {
    expect(JSON.stringify(dictionary)).not.toContain("Crypto")
  })

  it("says the same to a buyer back from Robokassa as the whole dictionary does", () => {
    for (const notice of ["pending", "failed"] as const) {
      expect(renderCut(notice)).toBe(render(notice))
    }
  })

  it("gives a cart with a leftover invoice session the general notice, never the name of a key", () => {
    const leftovers = [
      btcpayCart("pending", { invoice_status: "Processing", expires_at: "2099-01-01T00:00:00.000Z" }),
      btcpayCart("canceled", { invoice_status: "Expired", additional_status: "None" }),
      bitcartCart("pending", { invoice_status: "confirmed", expires_at: "2099-01-01T00:00:00.000Z" }),
      bitcartCart("canceled", { invoice_status: "expired", exception_status: "none" }),
    ]

    for (const leftover of leftovers) {
      const html = renderCut("pending", leftover)

      expect(html).toContain('data-testid="payment-pending-notice"')
      expect(html).toContain("Оплата подтверждается")
      expect(html).toContain("Проверить ещё раз")
      expect(html).not.toContain("CheckoutPage.")
      expect(html).not.toContain("Crypto")
    }
  })
})
