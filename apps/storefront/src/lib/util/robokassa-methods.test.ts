import { describe, expect, it } from "vitest"

import en from "../../../messages/en.json"
import ru from "../../../messages/ru.json"
import {
  isRobokassaFailReturn,
  parsePaymentChoice,
  pickRobokassaMethod,
  robokassaChoiceValue,
  robokassaMethodLabel,
  robokassaMethodsForCart,
  robokassaPaymentRequest,
  type RobokassaMethod,
} from "./robokassa-methods"

/**
 * t-2026-10-04-49: the checkout lists the Robokassa methods the shop enabled
 * and opens Robokassa straight on the one picked, but only on an alias the
 * backend's own session lists.
 */

const method = (alias: string, extra: Partial<RobokassaMethod> = {}): RobokassaMethod => ({
  alias,
  name_ru: null,
  name_en: null,
  min: null,
  max: null,
  ...extra,
})

/** The shop's live list on 2026-10-04, as `GET /store/tenant/robokassa-methods` answers it. */
const LIVE: RobokassaMethod[] = [
  method("BankCard", { name_ru: "Банковская карта", name_en: "Bank Card" }),
  method("SBP", { name_ru: "Банковская карта", name_en: "Bank Card", max: 1000000 }),
  method("Card120Days", { name_ru: "Карта 120 дней без %", name_en: "120 days without % Card" }),
  method("BankCardHalva", { name_ru: "Карта Халва", name_en: "Card Halva" }),
]

/** A next-intl translator over one catalog's `PaymentMethods` namespace. */
const translator = (catalog: { PaymentMethods: Record<string, string> }) => {
  const t = (key: string) => catalog.PaymentMethods[key] ?? key
  t.has = (key: string) => key in catalog.PaymentMethods
  return t
}

describe("robokassaMethodLabel", () => {
  it("names the four live methods from the catalogs, not from Robokassa's own (wrong) SBP name", () => {
    const labels = (catalog: typeof ru, locale: string) =>
      LIVE.map((item) => robokassaMethodLabel(translator(catalog), item, locale))

    expect(labels(ru, "ru")).toEqual(["Банковская карта", "СБП", "Карта 120 дней без %", "Карта Халва"])
    expect(labels(en, "en")).toEqual([
      "Bank card",
      "Faster Payments (SBP)",
      "120 Days Interest-Free card",
      "Halva card",
    ])
  })

  it("falls back to Robokassa's name in the reader's language for an alias the catalogs do not know", () => {
    const sberPay = method("SberPay", { name_ru: "СберПэй", name_en: "SberPay" })
    expect(robokassaMethodLabel(translator(ru), sberPay, "ru")).toBe("СберПэй")
    expect(robokassaMethodLabel(translator(en), sberPay, "de")).toBe("SberPay")
    expect(robokassaMethodLabel(translator(en), method("Mokka"), "en")).toBe("Mokka")
  })
})

describe("robokassaMethodsForCart", () => {
  it("keeps the backend's list and order", () => {
    expect(robokassaMethodsForCart(LIVE, 1500).map((item) => item.alias)).toEqual([
      "BankCard",
      "SBP",
      "Card120Days",
      "BankCardHalva",
    ])
  })

  it("falls back to card and SBP when the backend could not answer or answered nothing", () => {
    expect(robokassaMethodsForCart(null, 1500).map((item) => item.alias)).toEqual(["BankCard", "SBP"])
    expect(robokassaMethodsForCart([], 1500).map((item) => item.alias)).toEqual(["BankCard", "SBP"])
  })

  it("hides a method whose limits leave the cart's total out, never all of them", () => {
    expect(robokassaMethodsForCart(LIVE, 1_500_000).map((item) => item.alias)).toEqual([
      "BankCard",
      "Card120Days",
      "BankCardHalva",
    ])
    const onlyLimited = [method("Mokka", { min: 1000 })]
    expect(robokassaMethodsForCart(onlyLimited, 10).map((item) => item.alias)).toEqual(["Mokka"])
  })

  it("drops an entry whose alias is not shaped like one", () => {
    expect(robokassaMethodsForCart([method("SBP"), method("x&OutSum=1")], 100).map((item) => item.alias)).toEqual([
      "SBP",
    ])
  })
})

describe("pickRobokassaMethod and the radio values", () => {
  it("keeps the buyer's pick while it is listed, else takes the first", () => {
    expect(pickRobokassaMethod("SBP", LIVE)).toBe("SBP")
    expect(pickRobokassaMethod("Gone", LIVE)).toBe("BankCard")
    expect(pickRobokassaMethod(null, [])).toBeNull()
  })

  it("round-trips a Robokassa row and leaves every other provider's value alone", () => {
    const value = robokassaChoiceValue("pp_robokassa_robokassa", "SBP")
    expect(parsePaymentChoice(value)).toEqual({ providerId: "pp_robokassa_robokassa", alias: "SBP" })
    expect(parsePaymentChoice("pp_system_default")).toEqual({ providerId: "pp_system_default", alias: null })
    expect(parsePaymentChoice("pp_robokassa_robokassa::x&y")).toEqual({
      providerId: "pp_robokassa_robokassa",
      alias: null,
    })
  })
})

describe("robokassaPaymentRequest", () => {
  const fields = {
    MerchantLogin: "SHOP",
    OutSum: "1500.00",
    InvId: "123",
    SignatureValue: "abc",
    Shp_SessionID: "payses_1",
    IsTest: "1",
    Receipt: "%7B%22sno%22%3A%22osn%22%7D",
  }
  const session = {
    payment_url: "https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=SHOP&OutSum=1500.00",
    payment_fields: fields,
    payment_methods: ["BankCard", "SBP", "Card120Days", "BankCardHalva"],
    success_url: "https://shop.test/api/payment-return?provider=robokassa&outcome=success",
    fail_url: "https://shop.test/api/payment-return?provider=robokassa&outcome=fail",
  }

  it("opens the modal on the picked method alone, with the signed fields untouched", () => {
    const request = robokassaPaymentRequest(session, "SBP")

    expect(request.alias).toBe("SBP")
    expect(request.modalParams).toEqual({
      ...fields,
      IncCurrLabel: "SBP",
      Settings: JSON.stringify({ PaymentMethods: ["SBP"], Mode: "modal" }),
    })
    expect(request.redirectUrl).toBe(`${session.payment_url}&IncCurrLabel=SBP`)
    expect(request.successUrl).toBe(session.success_url)
  })

  it("never opens Robokassa on an alias the session's whitelist does not list", () => {
    for (const picked of ["Mokka", "SBP&OutSum=1", "", null]) {
      const request = robokassaPaymentRequest(session, picked)
      expect(request.alias).toBeNull()
      expect(request.modalParams?.IncCurrLabel).toBeUndefined()
      expect(request.modalParams?.Settings).toBe(JSON.stringify({ Mode: "modal" }))
      expect(request.redirectUrl).toBe(session.payment_url)
    }
    const noWhitelist = robokassaPaymentRequest({ ...session, payment_methods: undefined }, "SBP")
    expect(noWhitelist.alias).toBeNull()
  })

  it("has no modal request for a session built before the modal, only the redirect", () => {
    const legacy = robokassaPaymentRequest({ payment_url: session.payment_url, payment_methods: ["SBP"] }, "SBP")
    expect(legacy.modalParams).toBeNull()
    expect(legacy.redirectUrl).toBe(`${session.payment_url}&IncCurrLabel=SBP`)
  })

  it("refuses a payment URL that does not point at Robokassa", () => {
    const request = robokassaPaymentRequest({ ...session, payment_url: "https://evil.test/pay" }, "SBP")
    expect(request.redirectUrl).toBeNull()
  })

  it("answers nothing to open for a missing session", () => {
    expect(robokassaPaymentRequest(null, "SBP")).toEqual({
      alias: null,
      modalParams: null,
      redirectUrl: null,
      successUrl: null,
      failUrl: null,
    })
  })
})

describe("isRobokassaFailReturn", () => {
  const failUrl = "https://shop.test/api/payment-return?provider=robokassa&cart_id=cart_1&outcome=fail"

  it("recognises the session's own FailUrl2, with whatever Robokassa appends", () => {
    expect(isRobokassaFailReturn(`${failUrl}&OutSum=1500.00&InvId=123`, failUrl)).toBe(true)
  })

  it("lets every other address through", () => {
    expect(isRobokassaFailReturn(failUrl.replace("outcome=fail", "outcome=success"), failUrl)).toBe(false)
    expect(isRobokassaFailReturn("https://evil.test/api/payment-return?outcome=fail", failUrl)).toBe(false)
    expect(isRobokassaFailReturn("not a url", failUrl)).toBe(false)
    expect(isRobokassaFailReturn(failUrl, null)).toBe(false)
  })
})
