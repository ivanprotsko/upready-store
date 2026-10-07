import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import type { AbstractIntlMessages } from "next-intl"
import { describe, expect, it } from "vitest"

import { EMPTY_MANUAL_PAYMENT } from "../tenant/manual-payment"
import { EMPTY_TENANT_PAYMENT_METHODS } from "../tenant/payment-methods"
import { CLIENT_MESSAGE_RULES, clientMessageFacts, clientMessages } from "./client-messages"

/**
 * t-2026-10-08-13, part A6. The page code of a shop that takes Robokassa alone carried the
 * whole dictionary, and in it the names of payment methods the shop never had, the demo
 * card's notes, the starter's placeholders and the cookie banner. The catalogues below are
 * the real ones: what the function is given in production.
 */
const SRC_DIR = path.resolve(__dirname, "../..")
const MESSAGES_DIR = path.resolve(SRC_DIR, "../messages")

const catalogue = (locale: string): AbstractIntlMessages =>
  JSON.parse(readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), "utf8"))

const ru = catalogue("ru")
const en = catalogue("en")

/** Every text of a catalogue, with the path of its key. */
const texts = (node: unknown, prefix = ""): { key: string; text: string }[] => {
  if (typeof node === "string") {
    return [{ key: prefix, text: node }]
  }
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([key, value]) =>
      texts(value, prefix ? `${prefix}.${key}` : key)
    )
  }
  return []
}

const NO_ANALYTICS = { yandexMetricaId: null, ga4MeasurementId: null }

/**
 * cherkashino.ru on the night of the moderation: Robokassa and nothing else, no counter. The
 * test-mode label is hidden there by `STOREFRONT_HIDE_TEST_MODE_DOT` as well, but that label
 * is no part of the dictionary (`testModeLabel` in `lib/tenant/test-mode.ts` holds it, and
 * the dot is not rendered with the switch on), so the switch is no fact of this function.
 */
const ROBOKASSA_ONLY = clientMessageFacts({
  shop: true,
  paymentMethods: { ...EMPTY_TENANT_PAYMENT_METHODS, robokassa: true, demo: false },
  manualPayment: EMPTY_MANUAL_PAYMENT,
  analytics: NO_ANALYTICS,
  onboarding: false,
})

/** A shop of the international server: three cryptocurrency gateways, a transfer by requisites, a counter. */
const TAKES_CRYPTO = clientMessageFacts({
  shop: true,
  paymentMethods: {
    robokassa: false,
    btcpay: true,
    bitcart: true,
    x402: true,
    manualCrypto: true,
    manualManager: true,
    demo: false,
  },
  manualPayment: { ...EMPTY_MANUAL_PAYMENT, enabled: true },
  analytics: { yandexMetricaId: "12345678", ga4MeasurementId: null },
  onboarding: false,
})

/** A shop that connected nothing: the demo card is its only way to pay. */
const DEMO_ONLY = clientMessageFacts({
  shop: true,
  paymentMethods: EMPTY_TENANT_PAYMENT_METHODS,
  manualPayment: EMPTY_MANUAL_PAYMENT,
  analytics: NO_ANALYTICS,
  onboarding: false,
})

/** The store lead's acceptance list for the page code of a shop that takes Robokassa alone. */
const ACCEPTANCE_WORDS = [
  "Криптовалют",
  "USDC",
  "x402",
  "PayPal",
  "Bancontact",
  "iDeal",
  "MetaMask",
  "кошельк",
  "Тестовая оплата",
  "Демокарта",
  "тестовый заказ",
  "заглушка",
  "стартер",
  "используем куки",
]

/** The strings the three checks of the night quoted from the page code. */
const QUOTED_STRINGS = [
  "Криптовалюта",
  "USDC (x402)",
  "MetaMask или Coinbase Wallet",
  "на один из кошельков ниже",
  "Тестовая оплата — деньги не списываются.",
  "Демокарта — реальный платёж не списывается",
  "Ваш тестовый заказ успешно создан!",
  "Это страница-заглушка из стартера. Замените текст своим до запуска магазина.",
  "Полнофункциональный, готовый к продакшену DTC-стартер.",
  "Мы используем куки, чтобы понимать, как посетители пользуются сайтом.",
]

const hits = (messages: AbstractIntlMessages, words: string[]) =>
  texts(messages).flatMap(({ key, text }) =>
    words
      .filter((word) => text.toLowerCase().includes(word.toLowerCase()))
      .map((word) => `${key}: ${word}`)
  )

describe("clientMessages: a shop that takes Robokassa alone", () => {
  const cut = clientMessages(ru, ROBOKASSA_ONLY)

  it("the whole catalogue does carry the words, so the check below is not empty", () => {
    expect(hits(ru, ACCEPTANCE_WORDS).length).toBeGreaterThan(20)
    expect(hits(ru, QUOTED_STRINGS).length).toBeGreaterThanOrEqual(QUOTED_STRINGS.length)
  })

  it("hands the browser no word of the acceptance list, in any letter case", () => {
    expect(hits(cut, ACCEPTANCE_WORDS)).toEqual([])
  })

  it("hands the browser none of the strings quoted from the page code", () => {
    expect(hits(cut, QUOTED_STRINGS)).toEqual([])
  })

  it("keeps what the shop does show: Robokassa's own labels and the rest of the checkout", () => {
    expect(cut.PaymentMethods).toEqual({
      pp_robokassa_robokassa: "Robokassa",
      robokassaBankCard: "Банковская карта",
      robokassaCard120Days: "Карта 120 дней без %",
      robokassaGroupForeignCards: "Зарубежные карты",
      robokassaGroupOther: "Другие способы",
      robokassaGroupRuCards: "Карты РФ (МИР)",
      robokassaHalva: "Карта Халва",
      robokassaSbp: "СБП",
    })
    expect(cut.PaymentPreNotice).toBe(ru.PaymentPreNotice)
    expect(cut.PaymentButton).toBe(ru.PaymentButton)
    expect(cut.Cart).toBe(ru.Cart)
    expect(Object.keys(cut.PromoBanner)).toEqual(["close"])
  })

  it("leaves every section's name in place, an emptied section as an empty object", () => {
    expect(Object.keys(cut)).toEqual(Object.keys(ru))
    expect(cut.ManualPayment).toEqual({})
    expect(cut.DemoCard).toEqual({})
    expect(cut.AnalyticsConsent).toEqual({})
  })

  it("cuts the same keys in every other locale", () => {
    const keys = (messages: AbstractIntlMessages) =>
      texts(messages)
        .map(({ key }) => key)
        .sort()

    expect(keys(clientMessages(en, ROBOKASSA_ONLY))).toEqual(keys(cut))
  })

  it("does not change the catalogue it was given", () => {
    expect(ru).toEqual(catalogue("ru"))
  })
})

describe("clientMessages: a shop keeps the strings of what it has", () => {
  it("a shop that takes cryptocurrency keeps its sections as they were", () => {
    const cut = clientMessages(ru, TAKES_CRYPTO)

    expect(cut.ManualPayment).toBe(ru.ManualPayment)
    expect(cut.AnalyticsConsent).toBe(ru.AnalyticsConsent)
    expect(cut.Errors).toBe(ru.Errors)
    expect(cut.CheckoutPage).toMatchObject({
      x402SignHint: "Кошелёк попросит подписать платёж в USDC.",
      x402TestNetwork: "Тестовая сеть: этот USDC ничего не стоит.",
    })
    expect(cut.PaymentMethods).toMatchObject({
      pp_btcpay_btcpay: "Криптовалюта",
      pp_bitcart_bitcart: "Криптовалюта",
      pp_x402_x402: "USDC (x402)",
      pp_system_default: "Оплата вручную",
    })
    // It has no demo card: «Перевод по реквизитам» is what its manual provider shows.
    expect(cut.DemoCard).toEqual({})
    expect(cut.CheckoutPage).not.toHaveProperty("demoPaymentNotice")
  })

  it("a shop with the demo card alone keeps the card's form, its notice and its label", () => {
    const cut = clientMessages(ru, DEMO_ONLY)

    expect(cut.DemoCard).toBe(ru.DemoCard)
    expect(cut.CheckoutPage).toMatchObject({
      demoPaymentNotice: "Тестовая оплата — деньги не списываются.",
    })
    expect(cut.PaymentMethods).toMatchObject({ pp_system_default: "Оплата вручную" })
    expect(cut.ManualPayment).toEqual({})
  })

  it("the starter's order block keeps its strings for a request with the onboarding cookie", () => {
    const withCookie = clientMessages(ru, { ...ROBOKASSA_ONLY, onboarding: true })

    expect(withCookie.OnboardingCta).toBe(ru.OnboardingCta)
    expect(clientMessages(ru, ROBOKASSA_ONLY).OnboardingCta).toEqual({})
  })

  it("a host with no shop behind it gets the catalogue whole", () => {
    expect(clientMessages(ru, { ...ROBOKASSA_ONLY, shop: false })).toBe(ru)
  })
})

describe("clientMessageFacts", () => {
  it("reads «Перевод по реквизитам» from the checkout's own flag and from the backend's two", () => {
    const base = {
      shop: true,
      analytics: NO_ANALYTICS,
      onboarding: false,
      paymentMethods: { ...EMPTY_TENANT_PAYMENT_METHODS, robokassa: true, demo: false },
      manualPayment: EMPTY_MANUAL_PAYMENT,
    }

    expect(clientMessageFacts(base)).toMatchObject({
      manualPayment: false,
      systemDefault: false,
      demoCard: false,
    })
    expect(
      clientMessageFacts({ ...base, manualPayment: { enabled: true } })
    ).toMatchObject({ manualPayment: true, systemDefault: true, demoCard: false })
    // The backend offers the manual provider and the checkout sees no manual kind: the
    // form it draws is the demo card, so both sets of strings stay.
    expect(
      clientMessageFacts({
        ...base,
        paymentMethods: { ...base.paymentMethods, manualManager: true },
      })
    ).toMatchObject({ manualPayment: true, systemDefault: true, demoCard: true })
  })

  it("counts either counter as analytics", () => {
    const base = {
      shop: true,
      onboarding: false,
      paymentMethods: EMPTY_TENANT_PAYMENT_METHODS,
      manualPayment: EMPTY_MANUAL_PAYMENT,
    }

    expect(clientMessageFacts({ ...base, analytics: NO_ANALYTICS }).analytics).toBe(false)
    expect(
      clientMessageFacts({ ...base, analytics: { yandexMetricaId: null, ga4MeasurementId: "G-1" } })
        .analytics
    ).toBe(true)
  })
})

describe("CLIENT_MESSAGE_RULES: the table is the whole of the decision", () => {
  /** Every switch off: the most the function can ever cut. */
  const EVERYTHING_OFF = {
    shop: true,
    btcpay: false,
    bitcart: false,
    x402: false,
    systemDefault: false,
    manualPayment: false,
    demo: false,
    demoCard: false,
    analytics: false,
    onboarding: false,
  }

  it("names a condition and a reason for every row", () => {
    for (const rule of CLIENT_MESSAGE_RULES) {
      expect(rule.condition.trim().length, `${rule.section}: condition`).toBeGreaterThan(4)
      expect(rule.reason.trim().length, `${rule.section}: reason`).toBeGreaterThan(40)
    }
  })

  it("names only sections and keys the catalogue has", () => {
    for (const rule of CLIENT_MESSAGE_RULES) {
      const section = en[rule.section]

      expect(typeof section, `section ${rule.section}`).toBe("object")
      if (rule.keys !== "*") {
        for (const key of rule.keys) {
          expect(section, `${rule.section}.${key}`).toHaveProperty([key])
        }
      }
    }
  })

  it("no key is named by two rows", () => {
    const named = CLIENT_MESSAGE_RULES.flatMap((rule) =>
      rule.keys === "*" ? [`${rule.section}.*`] : rule.keys.map((key) => `${rule.section}.${key}`)
    )

    expect(new Set(named).size).toBe(named.length)
    for (const rule of CLIENT_MESSAGE_RULES.filter((each) => each.keys === "*")) {
      expect(CLIENT_MESSAGE_RULES.filter((each) => each.section === rule.section)).toHaveLength(1)
    }
  })

  it("a section with no row is handed over whole, a new one included", () => {
    const named = new Set(CLIENT_MESSAGE_RULES.map((rule) => rule.section))
    const source = { ...ru, BrandNewSection: { greeting: "новая строка" } }
    const cut = clientMessages(source, EVERYTHING_OFF)

    expect(cut.BrandNewSection).toBe(source.BrandNewSection)
    for (const section of Object.keys(ru).filter((name) => !named.has(name))) {
      expect(cut[section], section).toBe(ru[section])
    }
    expect(Object.keys(ru).filter((name) => named.has(name)).sort()).toEqual(Array.from(named).sort())
  })

  it("inside a section with rows, a key with no row stays", () => {
    const cut = clientMessages(ru, EVERYTHING_OFF)
    const namedKeys = (section: string) =>
      CLIENT_MESSAGE_RULES.filter((rule) => rule.section === section).flatMap((rule) =>
        rule.keys === "*" ? [] : rule.keys
      )

    for (const section of ["PaymentMethods", "CheckoutPage", "Errors", "PromoBanner"]) {
      const before = Object.keys(ru[section])
      const expected = before.filter((key) => !namedKeys(section).includes(key))

      expect(Object.keys(cut[section]), section).toEqual(expected)
      expect(expected.length, section).toBeGreaterThan(0)
    }
  })

  // A row marked `serverOnly` is cut for every shop. That is right only while no client
  // component asks for the section: `useTranslations` is the client's reader.
  it("no source file reads a server-only section with useTranslations", () => {
    const sources: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
        } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          sources.push(full)
        }
      }
    }
    walk(SRC_DIR)

    const serverOnly = CLIENT_MESSAGE_RULES.filter((rule) => rule.serverOnly).map(
      (rule) => rule.section
    )
    expect(serverOnly).toEqual(["ProductOnboardingCta", "ContentPages"])
    expect(sources.length).toBeGreaterThan(500)

    for (const file of sources) {
      const code = readFileSync(file, "utf8")
      for (const section of serverOnly) {
        expect(
          code.includes(`useTranslations("${section}")`) || code.includes(`"${section}.`),
          `${path.relative(SRC_DIR, file)} reads ${section} on the client`
        ).toBe(false)
      }
    }
  })
})
