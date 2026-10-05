import { describe, expect, it } from "vitest"

import {
  EMPTY_PAYMENT_PRE_NOTICE,
  EMPTY_PRE_NOTICE_ENTRY,
  formatChargeAmount,
  parsePaymentPreNoticeHeader,
  preNoticeProviderKey,
  readPaymentPreNotice,
  sellerLabel,
  shouldShowPrePaymentNotice,
} from "./payment-pre-notice"

describe("shouldShowPrePaymentNotice", () => {
  it("hides the notice on the shop's own page, same currency, not a foreign card", () => {
    expect(shouldShowPrePaymentNotice(EMPTY_PRE_NOTICE_ENTRY, "rub")).toBe(false)
  })

  it("shows the notice when the charge currency differs from the cart's", () => {
    expect(
      shouldShowPrePaymentNotice({ ...EMPTY_PRE_NOTICE_ENTRY, chargeCurrencyCode: "usd" }, "rub")
    ).toBe(true)
  })

  it("is case-insensitive on the currency comparison", () => {
    expect(
      shouldShowPrePaymentNotice({ ...EMPTY_PRE_NOTICE_ENTRY, chargeCurrencyCode: "RUB" }, "Rub")
    ).toBe(false)
  })

  it("shows the notice for a foreign card, same currency", () => {
    expect(shouldShowPrePaymentNotice({ ...EMPTY_PRE_NOTICE_ENTRY, isForeignCard: true }, "rub")).toBe(
      true
    )
  })

  it("shows the notice for a domain redirect alone", () => {
    expect(
      shouldShowPrePaymentNotice({ ...EMPTY_PRE_NOTICE_ENTRY, redirectKind: "domain" }, "rub")
    ).toBe(true)
  })

  it("shows the notice for a crypto wallet redirect", () => {
    expect(
      shouldShowPrePaymentNotice({ ...EMPTY_PRE_NOTICE_ENTRY, redirectKind: "crypto_network" }, "rub")
    ).toBe(true)
  })

  it("shows the notice for a Telegram bot redirect", () => {
    expect(
      shouldShowPrePaymentNotice({ ...EMPTY_PRE_NOTICE_ENTRY, redirectKind: "telegram_bot" }, "rub")
    ).toBe(true)
  })
})

describe("preNoticeProviderKey", () => {
  it("maps every known provider id", () => {
    expect(preNoticeProviderKey("pp_robokassa_robokassa")).toBe("robokassa")
    expect(preNoticeProviderKey("pp_tribute_tribute")).toBe("tribute")
    expect(preNoticeProviderKey("pp_btcpay_btcpay")).toBe("btcpay")
    expect(preNoticeProviderKey("pp_bitcart_bitcart")).toBe("bitcart")
    expect(preNoticeProviderKey("pp_system_default")).toBe("manual")
    expect(preNoticeProviderKey("pp_stripe_stripe")).toBe("card")
    expect(preNoticeProviderKey("pp_medusa-payments_default")).toBe("card")
    expect(preNoticeProviderKey("pp_paypal_paypal")).toBe("card")
  })

  it("answers null for a method rule 5zd has no entry for", () => {
    expect(preNoticeProviderKey("pp_unknown_thing")).toBeNull()
  })
})

describe("readPaymentPreNotice / parsePaymentPreNoticeHeader", () => {
  it("answers every provider key empty for a shop that configured nothing", () => {
    expect(readPaymentPreNotice(null)).toEqual(EMPTY_PAYMENT_PRE_NOTICE)
    expect(readPaymentPreNotice({})).toEqual(EMPTY_PAYMENT_PRE_NOTICE)
    expect(parsePaymentPreNoticeHeader(null)).toBeNull()
    expect(parsePaymentPreNoticeHeader("not json")).toBeNull()
  })

  it("reads a stored entry from the backend's snake_case document", () => {
    const doc = readPaymentPreNotice({
      manual: {
        charge_currency_code: "USDT",
        is_foreign_card: false,
        redirect_kind: "crypto_network",
        redirect_value: "TRC20",
        rate_source: null,
        refund_terms: "не предусмотрен",
      },
    })

    expect(doc.manual).toEqual({
      chargeCurrencyCode: "usdt",
      isForeignCard: false,
      redirectKind: "crypto_network",
      redirectValue: "TRC20",
      rateSource: null,
      refundTerms: "не предусмотрен",
    })
    expect(doc.card).toEqual(EMPTY_PRE_NOTICE_ENTRY)
  })

  it("round-trips through the header's JSON string", () => {
    const parsed = parsePaymentPreNoticeHeader(
      JSON.stringify({ card: { is_foreign_card: true } })
    )
    expect(parsed?.card.isForeignCard).toBe(true)
  })
})

describe("sellerLabel", () => {
  it("prefers the legal name over the display name", () => {
    expect(sellerLabel({ name: "Cherkashino", legal_name: "ИП Черкашина А. А." })).toBe(
      "ИП Черкашина А. А."
    )
  })

  it("falls back to the display name while no legal name is on file", () => {
    expect(sellerLabel({ name: "Cherkashino", legal_name: null })).toBe("Cherkashino")
  })

  it("never needs, and so can never leak, an INN or an OGRN", () => {
    // `sellerLabel` has no `inn`/`ogrn` parameter at all — the international
    // shop's requisites are already blanked at the source
    // (`strip-legal-entity.ts`), and this is the second, structural half of
    // that guarantee: no caller of this function can thread a registration
    // number through it even by passing a bigger object by mistake.
    const label = sellerLabel({
      name: "Cherkashino International",
      legal_name: null,
      // @ts-expect-error — extra fields a caller should not be passing in the first place
      inn: "123456789012",
      ogrn: "1234567890123",
    })
    expect(label).toBe("Cherkashino International")
    expect(label).not.toMatch(/ИНН|ОГРН|\d{10,}/)
  })
})

describe("formatChargeAmount", () => {
  it("formats a real ISO currency", () => {
    expect(formatChargeAmount(100, "usd", "en-US")).toBe("$100.00")
  })

  it("falls back to plain digits plus the code for a non-ISO currency (crypto)", () => {
    expect(formatChargeAmount(42.5, "usdt", "en-US")).toBe("42.50 USDT")
  })
})
