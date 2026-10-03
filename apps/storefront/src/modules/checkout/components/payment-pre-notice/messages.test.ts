import { readFileSync } from "node:fs"
import path from "node:path"
import { createTranslator } from "next-intl"
import { describe, expect, it } from "vitest"

import { locales } from "@i18n/config"

/**
 * The six `PaymentPreNotice` messages formatted in every locale, with the
 * arguments `index.tsx` passes (t-2026-10-03-32). Key parity alone
 * (`src/i18n/messages.test.ts`) misses a translation whose ICU breaks: a
 * dropped brace or a missing `select` branch fails as INVALID_MESSAGE, and an
 * apostrophe before `{` or `<` quotes the placeholder or the tag away and
 * prints it literally. Each argument value has to come out in the sentence,
 * and the two links have to stay links.
 */

const MESSAGES_DIR = path.resolve(__dirname, "../../../../../messages")

const catalog = (locale: string) =>
  JSON.parse(readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), "utf8"))

const REDIRECTS = {
  domain: "pay.example.com",
  telegram_bot: "@acme_pay_bot",
  crypto_network: "TRC20",
  bank: "Example Bank",
}

const CHARGE = { currency: "USD", rateSource: "ECB", amount: "$12.34" }

describe("PaymentPreNotice messages format in every locale", () => {
  it.each([...locales])("%s", (locale) => {
    const errors: string[] = []
    const t = createTranslator({
      locale,
      messages: catalog(locale),
      namespace: "PaymentPreNotice",
      onError: (error) => errors.push(`${error.code}: ${error.message}`),
    })

    const becomesClient = t.markup("becomesClient", {
      button: "Pay now",
      seller: "Acme Trading LLC",
      terms: (chunks) => `[terms:${chunks}]`,
      privacy: (chunks) => `[privacy:${chunks}]`,
    })
    expect(becomesClient).toContain("Pay now")
    expect(becomesClient).toContain("Acme Trading LLC")
    expect(becomesClient).toMatch(/\[terms:[^\]<>{}]+\]/)
    expect(becomesClient).toMatch(/\[privacy:[^\]<>{}]+\]/)

    const redirects = Object.entries(REDIRECTS).map(([kind, value]) => {
      const sentence = t("redirect", { kind, value })
      expect(sentence, kind).toContain(value)
      return sentence
    })
    expect(new Set(redirects).size).toBe(redirects.length)
    expect(t("redirect", { kind: "other", value: "unused" })).toBe("")

    const withAmount = t("chargeWithAmount", CHARGE)
    for (const value of Object.values(CHARGE)) expect(withAmount).toContain(value)

    const withoutAmount = t("chargeWithoutAmount", {
      currency: CHARGE.currency,
      rateSource: CHARGE.rateSource,
    })
    expect(withoutAmount).toContain(CHARGE.currency)
    expect(withoutAmount).toContain(CHARGE.rateSource)

    expect(t("chargeNoSource", { currency: CHARGE.currency })).toContain(CHARGE.currency)
    expect(t("refund", { terms: "within 14 days" })).toContain("within 14 days")

    expect(errors).toEqual([])
  })
})
