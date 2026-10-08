import { readFileSync } from "node:fs"
import { join } from "node:path"
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import PaymentPreNotice from "."
import { locales } from "@i18n/config"
import { EMPTY_MANUAL_PAYMENT } from "@lib/tenant/manual-payment"
import { EMPTY_TENANT_PAYMENT_METHODS } from "@lib/tenant/payment-methods"
import { clientMessageFacts, clientMessages } from "@lib/util/client-messages"
import { NO_TENANT } from "@lib/util/legal-links"
import {
  EMPTY_PAYMENT_PRE_NOTICE,
  EMPTY_PRE_NOTICE_ENTRY,
  PAYMENT_PRE_NOTICE_REDIRECT_KINDS,
  type PaymentPreNoticeEntry,
  type TenantPaymentPreNotice,
} from "@lib/util/payment-pre-notice"

/**
 * t-2026-10-08-13, part A6c. The page's dictionary carries the three sentences about the
 * charge currency only for a shop whose pre-payment notice names a currency or a rate
 * source. The notice itself is drawn from the entry of the picked method, and a page opened
 * before the owner saved the entry holds the older dictionary. Whatever the two say, the
 * buyer never reads the name of a key.
 */

vi.mock("@i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const catalogue = (locale: string): AbstractIntlMessages =>
  JSON.parse(readFileSync(join(__dirname, `../../../../../messages/${locale}.json`), "utf8"))

const factsOf = (paymentPreNotice: TenantPaymentPreNotice) =>
  clientMessageFacts({
    shop: true,
    paymentMethods: { ...EMPTY_TENANT_PAYMENT_METHODS, robokassa: true, demo: false },
    manualPayment: EMPTY_MANUAL_PAYMENT,
    analytics: { yandexMetricaId: null, ga4MeasurementId: null },
    onboarding: false,
    paymentPreNotice,
    catalogViewControls: false,
  })

const noticeOf = (entry: Partial<PaymentPreNoticeEntry>): TenantPaymentPreNotice => ({
  ...EMPTY_PAYMENT_PRE_NOTICE,
  robokassa: { ...EMPTY_PRE_NOTICE_ENTRY, ...entry },
})

/** Every dictionary a page can hold, by what the shop's notice said when the page was opened. */
const DICTIONARIES = {
  "the whole catalogue (a host with no shop)": (whole: AbstractIntlMessages) => whole,
  "a shop with an empty notice": (whole: AbstractIntlMessages) =>
    clientMessages(whole, factsOf(EMPTY_PAYMENT_PRE_NOTICE)),
  "a shop whose notice names a redirect to a site and nothing else": (whole: AbstractIntlMessages) =>
    clientMessages(whole, factsOf(noticeOf({ redirectKind: "domain", redirectValue: "pay.example.com" }))),
  "a shop whose notice names a charge currency": (whole: AbstractIntlMessages) =>
    clientMessages(whole, factsOf(noticeOf({ chargeCurrencyCode: "usd", rateSource: "ЦБ РФ" }))),
  "a shop whose notice names a wallet in a network": (whole: AbstractIntlMessages) =>
    clientMessages(whole, factsOf(noticeOf({ redirectKind: "crypto_network", redirectValue: "TRC20" }))),
}

/** Every shape of an entry the reader branches on, with and without an estimate of the amount. */
const STATES: { entry: PaymentPreNoticeEntry; amount: number | null }[] = [null, ...PAYMENT_PRE_NOTICE_REDIRECT_KINDS].flatMap(
  (redirectKind) =>
    [null, "usd", "usdt"].flatMap((chargeCurrencyCode) =>
      [null, "ЦБ РФ"].flatMap((rateSource) =>
        [null, "в течение 14 дней"].flatMap((refundTerms) =>
          [null, 12.34].map((amount) => ({
            entry: {
              ...EMPTY_PRE_NOTICE_ENTRY,
              isForeignCard: true,
              redirectKind,
              redirectValue: redirectKind ? "pay.example.com" : null,
              chargeCurrencyCode,
              rateSource,
              refundTerms,
            },
            amount,
          }))
        )
      )
    )
)

const render = (
  messages: AbstractIntlMessages,
  state: { entry: PaymentPreNoticeEntry; amount: number | null },
  locale = "ru"
) => {
  const errors: string[] = []
  const html = renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      timeZone="UTC"
      // Through JSON, as the dictionary reaches the browser.
      messages={JSON.parse(JSON.stringify(messages))}
      onError={(error) => errors.push(`${error.code}: ${error.message}`)}
    >
      <PaymentPreNotice
        entry={state.entry}
        buttonText="Оплатить"
        seller="ИП Пример"
        legal={NO_TENANT}
        amount={state.amount}
      />
    </NextIntlClientProvider>
  )

  return { html, errors }
}

const CHARGED = { ...EMPTY_PRE_NOTICE_ENTRY, chargeCurrencyCode: "usd", rateSource: "ЦБ РФ" }

describe("PaymentPreNotice never shows the name of a key", () => {
  it("has every shape of an entry to check", () => {
    expect(STATES).toHaveLength(5 * 3 * 2 * 2 * 2)
  })

  it.each(Object.entries(DICTIONARIES))("with the dictionary of %s, in every state of the entry", (_, cut) => {
    const messages = cut(catalogue("ru"))

    for (const state of STATES) {
      const { html, errors } = render(messages, state)
      const label = JSON.stringify(state)

      expect(html, label).toContain('data-testid="payment-pre-notice"')
      expect(html, label).toContain("ИП Пример")
      expect(html, label).not.toContain("PaymentPreNotice.")
      expect(html, label).not.toMatch(/charge(WithAmount|WithoutAmount|NoSource)/)
      expect(errors, label).toEqual([])
    }
  })

  it.each([...locales])("%s: with the dictionary of a shop with an empty notice", (locale) => {
    const messages = clientMessages(catalogue(locale), factsOf(EMPTY_PAYMENT_PRE_NOTICE))

    for (const state of STATES) {
      const { html, errors } = render(messages, state, locale)
      const label = JSON.stringify(state)

      expect(html, label).not.toContain("PaymentPreNotice.")
      expect(html, label).not.toMatch(/charge(WithAmount|WithoutAmount|NoSource)/)
      expect(errors, label).toEqual([])
    }
  })
})

describe("PaymentPreNotice and the sentence about the charge currency", () => {
  const whole = catalogue("ru")
  const withCharge = DICTIONARIES["a shop whose notice names a charge currency"](whole)
  const withoutCharge = DICTIONARIES["a shop with an empty notice"](whole)

  it("says the same as before to a shop whose notice names a charge currency", () => {
    // That shop named no wallet in a network, so its sentence about the redirect is without
    // that branch (part A6b): the states with such a redirect are the next check's.
    for (const state of STATES.filter(({ entry }) => entry.redirectKind !== "crypto_network")) {
      expect(render(withCharge, state).html, JSON.stringify(state)).toBe(render(whole, state).html)
    }
  })

  it("says the same as before, in every state, to a shop whose notice names a currency and a wallet", () => {
    const keepsAll = clientMessages(
      whole,
      factsOf(noticeOf({ ...CHARGED, redirectKind: "crypto_network", redirectValue: "TRC20" }))
    )

    for (const state of STATES) {
      expect(render(keepsAll, state).html, JSON.stringify(state)).toBe(render(whole, state).html)
    }
  })

  it("draws the three sentences from the entry and the estimate", () => {
    expect(render(withCharge, { entry: CHARGED, amount: 12.34 }).html).toMatch(
      /Сумма будет списана в USD по курсу ЦБ РФ, ≈ .*12,34.*\./
    )
    expect(render(withCharge, { entry: CHARGED, amount: null }).html).toContain(
      "Сумма будет списана в USD по курсу ЦБ РФ на момент оплаты."
    )
    expect(render(withCharge, { entry: { ...CHARGED, rateSource: null }, amount: null }).html).toContain(
      "Сумма будет списана в USD."
    )
  })

  it("a page that holds the older dictionary draws the notice without that sentence", () => {
    const { html, errors } = render(withoutCharge, {
      entry: { ...CHARGED, redirectKind: "domain", redirectValue: "pay.example.com", refundTerms: "в течение 14 дней" },
      amount: 12.34,
    })

    expect(html).toContain("я становлюсь клиентом ИП Пример")
    expect(html).toContain("Для оплаты вы перейдёте на pay.example.com.")
    expect(html).toContain("Возврат: в течение 14 дней.")
    expect(html).not.toContain("будет списана")
    expect(html).not.toContain("по курсу")
    expect(errors).toEqual([])
  })

  it("an entry with no charge currency draws no such sentence from any dictionary", () => {
    for (const cut of Object.values(DICTIONARIES)) {
      const { html } = render(cut(whole), {
        entry: { ...EMPTY_PRE_NOTICE_ENTRY, isForeignCard: true, rateSource: "ЦБ РФ" },
        amount: 12.34,
      })

      expect(html).not.toContain("будет списана")
      expect(html).not.toContain('data-testid="payment-pre-notice-details"')
    }
  })
})
