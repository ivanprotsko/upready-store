import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { createTranslator, type AbstractIntlMessages } from "next-intl"
import { describe, expect, it } from "vitest"

import { EMPTY_MANUAL_PAYMENT } from "../tenant/manual-payment"
import { EMPTY_TENANT_PAYMENT_METHODS } from "../tenant/payment-methods"
import {
  CLIENT_MESSAGE_RULES,
  clientMessageFacts,
  clientMessages,
  withoutSelectBranch,
} from "./client-messages"
import { EMPTY_PAYMENT_PRE_NOTICE, EMPTY_PRE_NOTICE_ENTRY } from "./payment-pre-notice"

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
  paymentPreNotice: EMPTY_PAYMENT_PRE_NOTICE,
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
  // Its transfer by requisites goes to a wallet, and the owner said so in the notice.
  paymentPreNotice: {
    ...EMPTY_PAYMENT_PRE_NOTICE,
    manual: { ...EMPTY_PRE_NOTICE_ENTRY, redirectKind: "crypto_network", redirectValue: "TRC20" },
  },
})

/** A shop that connected nothing: the demo card is its only way to pay. */
const DEMO_ONLY = clientMessageFacts({
  shop: true,
  paymentMethods: EMPTY_TENANT_PAYMENT_METHODS,
  manualPayment: EMPTY_MANUAL_PAYMENT,
  analytics: NO_ANALYTICS,
  onboarding: false,
  paymentPreNotice: EMPTY_PAYMENT_PRE_NOTICE,
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
    // Part A6b: every key of the section stays; its sentence about a redirect loses one branch.
    expect(Object.keys(cut.PaymentPreNotice)).toEqual(Object.keys(ru.PaymentPreNotice))
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
      paymentPreNotice: EMPTY_PAYMENT_PRE_NOTICE,
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
      paymentPreNotice: EMPTY_PAYMENT_PRE_NOTICE,
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
    cryptoNetworkRedirect: false,
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

/**
 * t-2026-10-08-13, part A6b. After part A6 four places still carried cryptocurrency into the
 * page code of a shop that takes Robokassa alone: one branch of the sentence about where
 * paying leads («…на кошелёк в сети…», the branch `crypto_network`), and the NAMES of three
 * keys of the notice for a buyer back from an invoice of BTCPay or Bitcart.
 */
const LOCALES = readdirSync(MESSAGES_DIR)
  .filter((name) => name.endsWith(".json"))
  .map((name) => name.slice(0, -".json".length))
  .sort()

const CRYPTO_INVOICE_KEYS = [
  "paymentPendingCryptoText",
  "paymentExpiredCryptoHeading",
  "paymentExpiredCryptoText",
]

/** The kinds of redirect that stay, with a value each sentence has to carry. */
const REDIRECTS = {
  domain: "pay.example.com",
  telegram_bot: "@acme_pay_bot",
  bank: "Example Bank",
}

const sectionOf = (messages: AbstractIntlMessages, name: string): AbstractIntlMessages => {
  const section = messages[name]

  return typeof section === "object" ? section : {}
}

describe("clientMessages: no cryptocurrency in the dictionary of a shop with Robokassa alone (part A6b)", () => {
  it("has every catalogue of the storefront to check", () => {
    expect(LOCALES.length).toBeGreaterThanOrEqual(36)
  })

  it("names no «crypto» and no «кошел» in keys or in texts, in any letter case", () => {
    const whole = JSON.stringify(ru).toLowerCase()
    const cut = JSON.stringify(clientMessages(ru, ROBOKASSA_ONLY)).toLowerCase()

    // The whole catalogue does carry both, so the check is not empty.
    expect(whole).toContain("crypto")
    expect(whole).toContain("кошел")
    expect(cut).not.toContain("crypto")
    expect(cut).not.toContain("кошел")
  })

  it.each(LOCALES)("%s: no «crypto» in any key or text", (locale) => {
    expect(JSON.stringify(clientMessages(catalogue(locale), ROBOKASSA_ONLY)).toLowerCase()).not.toContain(
      "crypto"
    )
  })

  it.each(LOCALES)("%s: the redirect sentence loses one branch and formats as before", (locale) => {
    const whole = catalogue(locale)
    const cut = clientMessages(whole, ROBOKASSA_ONLY)
    const errors: string[] = []
    // Through JSON, as the dictionary reaches the browser; it also leaves the translator
    // untyped, the way a parsed catalogue is in `payment-pre-notice/messages.test.ts`.
    const translator = (messages: AbstractIntlMessages) =>
      createTranslator({
        locale,
        messages: JSON.parse(JSON.stringify(messages)),
        namespace: "PaymentPreNotice",
        onError: (error) => errors.push(`${error.code}: ${error.message}`),
      })
    const before = translator(whole)
    const after = translator(cut)

    expect(sectionOf(whole, "PaymentPreNotice").redirect).toContain("crypto_network")
    expect(sectionOf(cut, "PaymentPreNotice").redirect).not.toContain("crypto_network")

    for (const [kind, value] of Object.entries(REDIRECTS)) {
      const sentence = after("redirect", { kind, value })

      expect(sentence, kind).toBe(before("redirect", { kind, value }))
      expect(sentence, kind).toContain(value)
    }
    // A kind the message has no branch for is an empty sentence, which the reader drops.
    expect(before("redirect", { kind: "crypto_network", value: "TRC20" })).toContain("TRC20")
    expect(after("redirect", { kind: "crypto_network", value: "TRC20" })).toBe("")
    expect(after("redirect", { kind: "other", value: "unused" })).toBe("")
    // The branch is all that left the section.
    expect({
      ...sectionOf(cut, "PaymentPreNotice"),
      redirect: sectionOf(whole, "PaymentPreNotice").redirect,
    }).toEqual(whole.PaymentPreNotice)
    expect(errors).toEqual([])
  })

  it.each(LOCALES)("%s: a shop whose notice names a wallet in a network gets the message as it was", (locale) => {
    const whole = catalogue(locale)

    expect(clientMessages(whole, TAKES_CRYPTO).PaymentPreNotice).toBe(whole.PaymentPreNotice)
    expect(clientMessages(whole, { ...ROBOKASSA_ONLY, cryptoNetworkRedirect: true }).PaymentPreNotice).toBe(
      whole.PaymentPreNotice
    )
  })

  it("the three keys of the invoice notice stay for BTCPay or Bitcart and for nothing else", () => {
    const keysOf = (facts: typeof ROBOKASSA_ONLY) => Object.keys(sectionOf(clientMessages(ru, facts), "CheckoutPage"))

    for (const key of CRYPTO_INVOICE_KEYS) {
      expect(sectionOf(ru, "CheckoutPage"), key).toHaveProperty([key])
      expect(keysOf(ROBOKASSA_ONLY), key).not.toContain(key)
      expect(keysOf({ ...ROBOKASSA_ONLY, btcpay: true }), key).toContain(key)
      expect(keysOf({ ...ROBOKASSA_ONLY, bitcart: true }), key).toContain(key)
      // x402 and «Перевод по реквизитам» never reach that notice.
      expect(keysOf({ ...ROBOKASSA_ONLY, x402: true }), key).not.toContain(key)
      expect(keysOf({ ...ROBOKASSA_ONLY, manualPayment: true, systemDefault: true }), key).not.toContain(key)
    }
    expect(sectionOf(clientMessages(ru, TAKES_CRYPTO), "CheckoutPage")).toMatchObject(
      Object.fromEntries(CRYPTO_INVOICE_KEYS.map((key) => [key, sectionOf(ru, "CheckoutPage")[key]]))
    )
  })

  it("keeps the notice every gateway shares", () => {
    expect(sectionOf(clientMessages(ru, ROBOKASSA_ONLY), "CheckoutPage")).toMatchObject({
      paymentPendingHeading: "Оплата подтверждается",
      paymentPendingText: sectionOf(ru, "CheckoutPage").paymentPendingText,
      paymentPendingAction: "Проверить ещё раз",
      paymentInterruptedAction: sectionOf(ru, "CheckoutPage").paymentInterruptedAction,
    })
  })
})

describe("clientMessageFacts: the redirect to a wallet in a network", () => {
  const input = {
    shop: true,
    paymentMethods: { ...EMPTY_TENANT_PAYMENT_METHODS, robokassa: true, demo: false },
    manualPayment: EMPTY_MANUAL_PAYMENT,
    analytics: NO_ANALYTICS,
    onboarding: false,
  }
  const withRedirect = (redirectKind: "domain" | "telegram_bot" | "crypto_network" | "bank") =>
    clientMessageFacts({
      ...input,
      paymentPreNotice: {
        ...EMPTY_PAYMENT_PRE_NOTICE,
        manual: { ...EMPTY_PRE_NOTICE_ENTRY, redirectKind, redirectValue: "value" },
      },
    })

  it("is read from the shop's own pre-payment notice, any method's entry", () => {
    expect(withRedirect("crypto_network").cryptoNetworkRedirect).toBe(true)
    expect(
      clientMessageFacts({
        ...input,
        paymentPreNotice: {
          ...EMPTY_PAYMENT_PRE_NOTICE,
          robokassa: { ...EMPTY_PRE_NOTICE_ENTRY, redirectKind: "crypto_network" },
        },
      }).cryptoNetworkRedirect
    ).toBe(true)
  })

  it("is off for a shop with no notice and for every other kind of redirect", () => {
    expect(clientMessageFacts({ ...input, paymentPreNotice: EMPTY_PAYMENT_PRE_NOTICE }).cryptoNetworkRedirect).toBe(
      false
    )
    for (const kind of ["domain", "telegram_bot", "bank"] as const) {
      expect(withRedirect(kind).cryptoNetworkRedirect, kind).toBe(false)
    }
  })

  it("a gateway alone does not keep the branch: the kind is the owner's setting", () => {
    expect(
      clientMessageFacts({
        ...input,
        paymentMethods: { ...EMPTY_TENANT_PAYMENT_METHODS, btcpay: true, bitcart: true, demo: false },
        paymentPreNotice: EMPTY_PAYMENT_PRE_NOTICE,
      }).cryptoNetworkRedirect
    ).toBe(false)
  })
})

describe("withoutSelectBranch", () => {
  const message = "{kind, select, domain {Go to {value}.} crypto_network {Send to a wallet on {value}.} bank {Via {value}.} other {}}"

  it("cuts the branch with the white space before it and nothing else", () => {
    expect(withoutSelectBranch(message, "crypto_network")).toBe(
      "{kind, select, domain {Go to {value}.} bank {Via {value}.} other {}}"
    )
  })

  it("cuts the first and the last branch as well", () => {
    expect(withoutSelectBranch(message, "domain")).toBe(
      "{kind, select, crypto_network {Send to a wallet on {value}.} bank {Via {value}.} other {}}"
    )
    expect(withoutSelectBranch("{kind, select, a {x} b {y}}", "b")).toBe("{kind, select, a {x}}")
  })

  it("returns a message without the branch as it was", () => {
    expect(withoutSelectBranch(message, "telegram_bot")).toBe(message)
    expect(withoutSelectBranch("Plain words about crypto_network.", "crypto_network")).toBe(
      "Plain words about crypto_network."
    )
  })

  it("does not take a longer name or the word in a sentence for the branch", () => {
    const longer = "{kind, select, crypto_network_v2 {x} other {the crypto_network {value}}}"

    expect(withoutSelectBranch(longer, "crypto_network")).toBe(
      "{kind, select, crypto_network_v2 {x} other {the}}"
    )
    expect(withoutSelectBranch("{kind, select, crypto_network_v2 {x} other {}}", "crypto_network")).toBe(
      "{kind, select, crypto_network_v2 {x} other {}}"
    )
  })

  it("counts braces the way ICU does: an apostrophe quotes only before a brace", () => {
    // «l'importo» quotes nothing; `'{'` and `'}'` are text, not structure; `''` is an apostrophe.
    const quoted =
      "{kind, select, a {l'importo {value}} crypto_network {it''s '{' not a brace '}' {value}} b {dell'ordine} other {}}"

    expect(withoutSelectBranch(quoted, "crypto_network")).toBe(
      "{kind, select, a {l'importo {value}} b {dell'ordine} other {}}"
    )
  })

  it("never hands over a message it could not cut cleanly", () => {
    const open = "{kind, select, a {x} crypto_network {never closed other {}"

    expect(withoutSelectBranch(open, "crypto_network")).toBe(open)
  })
})
