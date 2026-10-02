import { describe, expect, it } from "vitest"

import {
  EMPTY_MANUAL_PAYMENT,
  availableManualPaymentKinds,
  parseManualPaymentHeader,
  readManualPayment,
  readManualPaymentKind,
} from "./manual-payment"

const WALLET = {
  network: "TRC-20",
  currency: "USDT",
  address: "TTestWalletAddressForTheUnitSuite",
}

describe("readManualPayment", () => {
  it("gives a shop that configured nothing both sections off", () => {
    expect(readManualPayment(null)).toEqual(EMPTY_MANUAL_PAYMENT)
    expect(readManualPayment(undefined)).toEqual(EMPTY_MANUAL_PAYMENT)
    expect(readManualPayment("garbage")).toEqual(EMPTY_MANUAL_PAYMENT)
    expect(
      readManualPayment({ crypto: { enabled: false }, manager: { enabled: false } })
    ).toEqual(EMPTY_MANUAL_PAYMENT)
  })

  it("turns a crypto section with no usable wallet off", () => {
    expect(
      readManualPayment({
        crypto: { enabled: true, wallets: [{ network: "TRC-20", currency: "USDT" }] },
      }).crypto
    ).toEqual({ enabled: false, wallets: [] })
  })

  it("reads the cards and drops one with no bank or no number", () => {
    expect(
      readManualPayment({
        manager: {
          enabled: true,
          cards: [
            { bank: "Сбербанк", number: "2202 0000 0000 0000", holder: "Иван И." },
            { bank: "ВТБ", number: "" },
          ],
        },
      }).manager.cards
    ).toEqual([{ bank: "Сбербанк", number: "2202 0000 0000 0000", holder: "Иван И." }])
  })

  it("reads the wallets and the contacts the backend published", () => {
    expect(
      readManualPayment({
        crypto: { enabled: true, wallets: [WALLET] },
        manager: { enabled: true, whatsapp: "+79990000000", telegram: null, email: "", note: "note" },
      })
    ).toEqual({
      crypto: { enabled: true, wallets: [WALLET] },
      manager: { enabled: true, cards: [], whatsapp: "+79990000000", telegram: null, email: null, note: "note" },
    })
  })
})

describe("availableManualPaymentKinds", () => {
  it("offers nothing extra for a shop that configured nothing, so the checkout looks as it does today", () => {
    expect(availableManualPaymentKinds(EMPTY_MANUAL_PAYMENT)).toEqual([])
  })

  it("offers crypto first, then the manager, when both are on", () => {
    expect(
      availableManualPaymentKinds({
        crypto: { enabled: true, wallets: [WALLET] },
        manager: { enabled: true, cards: [], whatsapp: null, telegram: "shop", email: null, note: null },
      })
    ).toEqual(["crypto", "other"])
  })

  it("offers the manager alone when only the manager is on", () => {
    expect(
      availableManualPaymentKinds({
        ...EMPTY_MANUAL_PAYMENT,
        manager: { enabled: true, cards: [], whatsapp: null, telegram: null, email: null, note: null },
      })
    ).toEqual(["other"])
  })
})

describe("parseManualPaymentHeader", () => {
  it("reads the header the middleware wrote", () => {
    const doc = {
      crypto: { enabled: true, wallets: [WALLET] },
      manager: { enabled: false, cards: [], whatsapp: null, telegram: null, email: null, note: null },
    }
    expect(parseManualPaymentHeader(JSON.stringify(doc))).toEqual(doc)
  })

  it("treats an unparsable or absent header as no offline method at all", () => {
    expect(parseManualPaymentHeader("{not json")).toBeNull()
    expect(parseManualPaymentHeader(null)).toBeNull()
    expect(parseManualPaymentHeader(undefined)).toBeNull()
  })
})

describe("readManualPaymentKind", () => {
  it("reads the kind the checkout stamped on the order", () => {
    expect(readManualPaymentKind({ manual_payment_kind: "crypto" })).toBe("crypto")
    expect(readManualPaymentKind({ manual_payment_kind: "other" })).toBe("other")
  })

  it("answers null for an order that predates the split or carries something else", () => {
    expect(readManualPaymentKind(null)).toBeNull()
    expect(readManualPaymentKind({})).toBeNull()
    expect(readManualPaymentKind({ manual_payment_kind: "card" })).toBeNull()
  })
})
