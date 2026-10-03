import { describe, expect, it } from "vitest"

import {
  EMPTY_MANUAL_PAYMENT,
  availableManualPaymentKinds,
  parseManualPaymentHeader,
  readManualPayment,
  readManualPaymentKind,
  requisiteIconSrc,
} from "./manual-payment"

describe("readManualPayment (batch 7 public view)", () => {
  it("reads the one ordered list with the icons the backend published", () => {
    const manual = readManualPayment({
      enabled: true,
      requisites: [
        { id: "a", kind: "bank", icon: "kaspi", bank: "Kaspi Bank", number: "4400 4300 1234 5678", holder: "DEMO" },
        { id: "b", kind: "crypto", icon: "usdt", currency: "USDT", network: "TRC20", address: "TXYZ" },
        { id: "c", kind: "bank", icon: null, bank: "Другой банк", number: "KZ12 3456", holder: null },
      ],
      contacts: { whatsapp: "+77001234567", telegram: null, email: null, note: "Только переводы" },
      crypto: { enabled: true, wallets: [{ network: "TRC20", currency: "USDT", address: "TXYZ" }] },
      manager: { enabled: true, cards: [], whatsapp: "+77001234567", telegram: null, email: null, note: null },
    })

    expect(manual.enabled).toBe(true)
    expect(manual.requisites.map((item) => item.id)).toEqual(["a", "b", "c"])
    expect(manual.requisites[0]).toMatchObject({ kind: "bank", icon: "kaspi", holder: "DEMO" })
    expect(manual.requisites[1]).toMatchObject({ kind: "crypto", icon: "usdt", network: "TRC20" })
    expect(manual.contacts.whatsapp).toBe("+77001234567")
    expect(manual.contacts.note).toBe("Только переводы")
    // The derived sections every reader from before batch 7 still takes.
    expect(manual.crypto).toEqual({ enabled: true, wallets: [{ network: "TRC20", currency: "USDT", address: "TXYZ" }] })
    expect(manual.manager.enabled).toBe(true)
    expect(manual.manager.cards).toHaveLength(2)
    expect(availableManualPaymentKinds(manual)).toEqual(["requisites"])
  })

  it("drops a malformed item and gives a duplicate id its position", () => {
    const manual = readManualPayment({
      enabled: true,
      requisites: [
        { id: "x", kind: "bank", bank: "Halyk", number: "1" },
        { id: "x", kind: "bank", bank: "Jusan", number: "2" },
        { id: "y", kind: "bank", bank: "", number: "3" },
        { id: "z", kind: "crypto", currency: "usdc", network: "ERC20" },
        "nonsense",
      ],
      contacts: null,
    })
    expect(manual.requisites.map((item) => item.id)).toEqual(["x", "x-1"])
  })

  it("is «not offered» when the list is empty and nobody can be asked, or the owner switched it off", () => {
    expect(readManualPayment({ enabled: true, requisites: [], contacts: null }).enabled).toBe(false)
    expect(
      readManualPayment({
        enabled: false,
        requisites: [{ id: "a", kind: "bank", bank: "Kaspi", number: "1" }],
        contacts: { telegram: "shop" },
      })
    ).toMatchObject({ enabled: false, requisites: [] })
    expect(readManualPayment(null).enabled).toBe(false)
    expect(readManualPayment("x").enabled).toBe(false)
  })

  it("offers the method on contacts alone", () => {
    const manual = readManualPayment({ enabled: true, requisites: [], contacts: { telegram: "shop" } })
    expect(manual.enabled).toBe(true)
    expect(manual.manager.enabled).toBe(true)
    expect(manual.crypto.enabled).toBe(false)
  })

  it("reads a document from before batch 7 into the list, cards first, then wallets", () => {
    const manual = readManualPayment({
      crypto: { enabled: true, wallets: [{ network: "TRC-20", currency: "usdt", address: "TABC" }] },
      manager: {
        enabled: true,
        cards: [{ bank: "Kaspi Gold", number: "4400 1234", holder: "Иван И." }],
        whatsapp: null,
        telegram: "shop",
        email: null,
        note: null,
      },
    })
    expect(manual.enabled).toBe(true)
    expect(manual.requisites).toEqual([
      { id: "card-0", kind: "bank", icon: null, bank: "Kaspi Gold", number: "4400 1234", holder: "Иван И." },
      { id: "wallet-0", kind: "crypto", icon: "usdt", network: "TRC-20", currency: "USDT", address: "TABC" },
    ])
    expect(manual.contacts.telegram).toBe("shop")
    expect(manual.crypto.enabled).toBe(true)
    expect(manual.manager.enabled).toBe(true)
  })

  it("ignores a legacy section the owner switched off", () => {
    const manual = readManualPayment({
      crypto: { enabled: false, wallets: [{ network: "TRC20", currency: "USDT", address: "T1" }] },
      manager: { enabled: false, cards: [{ bank: "Kaspi", number: "1" }], telegram: "shop" },
    })
    expect(manual.enabled).toBe(false)
    expect(manual.requisites).toEqual([])
    expect(availableManualPaymentKinds(manual)).toEqual([])
  })
})

describe("requisiteIconSrc", () => {
  it("draws crypto from the storefront's own marks and banks from the preset PNGs", () => {
    expect(
      requisiteIconSrc({ id: "a", kind: "crypto", icon: "usdt", currency: "USDT", network: "TRC20", address: "T" })
    ).toBe("/payment/usdt.svg")
    expect(
      requisiteIconSrc({ id: "b", kind: "bank", icon: "kaspi", bank: "Kaspi", number: "1", holder: null })
    ).toBe("/payment-icons/kaspi.png")
    expect(requisiteIconSrc({ id: "c", kind: "bank", icon: null, bank: "X", number: "1", holder: null })).toBeNull()
  })
})

describe("readManualPaymentKind", () => {
  it("accepts the three kinds and nothing else", () => {
    expect(readManualPaymentKind({ manual_payment_kind: "requisites" })).toBe("requisites")
    expect(readManualPaymentKind({ manual_payment_kind: "crypto" })).toBe("crypto")
    expect(readManualPaymentKind({ manual_payment_kind: "other" })).toBe("other")
    expect(readManualPaymentKind({ manual_payment_kind: "card" })).toBeNull()
    expect(readManualPaymentKind(null)).toBeNull()
  })
})

describe("parseManualPaymentHeader", () => {
  it("reads the header the middleware wrote", () => {
    const doc = {
      enabled: true,
      requisites: [{ id: "a", kind: "bank", icon: "halyk", bank: "Halyk Bank", number: "KZ00", holder: null }],
      contacts: { whatsapp: null, telegram: null, email: null, note: null },
    }
    expect(parseManualPaymentHeader(JSON.stringify(doc))).toEqual(readManualPayment(doc))
    expect(parseManualPaymentHeader(JSON.stringify(doc))?.requisites).toHaveLength(1)
  })

  it("treats an unparsable or absent header as no offline method at all", () => {
    expect(parseManualPaymentHeader("{not json")).toBeNull()
    expect(parseManualPaymentHeader(null)).toBeNull()
    expect(parseManualPaymentHeader(undefined)).toBeNull()
  })

  it("gives a shop that configured nothing the empty document", () => {
    expect(readManualPayment(undefined)).toEqual(EMPTY_MANUAL_PAYMENT)
    expect(readManualPayment({ crypto: { enabled: false }, manager: { enabled: false } })).toEqual(
      EMPTY_MANUAL_PAYMENT
    )
  })
})
