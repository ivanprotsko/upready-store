import { describe, expect, it } from "vitest"

import { PricingActionError, parseTariffEntry, pricingButtonHref } from "./actions"

describe("pricingButtonHref", () => {
  it("link: the saved address, as is", () => {
    expect(pricingButtonHref({ type: "link", href: "#final" }, "start")).toBe("#final")
    expect(pricingButtonHref({ type: "link", href: "https://t.me/upready" }, null)).toBe(
      "https://t.me/upready"
    )
  })

  it("onboarding_free: straight into the shop wizard with the tariff", () => {
    expect(pricingButtonHref({ type: "onboarding_free" }, "start")).toBe(
      "/start/onboarding?tariff=start"
    )
  })

  it("pay_first: the till first, with the tariff", () => {
    expect(pricingButtonHref({ type: "pay_first" }, "growth")).toBe("/start/pay?tariff=growth")
  })

  it("card_trial: the till in card-entry mode, with the trial length", () => {
    expect(pricingButtonHref({ type: "card_trial", trial_days: 14 }, "scale")).toBe(
      "/start/pay?tariff=scale&trial=14"
    )
  })

  it("card_trial without a trial length, or with a broken one, throws", () => {
    for (const trial_days of [undefined, 0, -3, 1.5, "14", 366, null]) {
      expect(() => pricingButtonHref({ type: "card_trial", trial_days }, "scale")).toThrow(
        PricingActionError
      )
    }
  })

  it("an unknown action throws instead of picking a default", () => {
    expect(() => pricingButtonHref({ type: "subscribe" }, "start")).toThrow(
      'unknown pricing button action "subscribe"'
    )
  })

  it("a missing action throws", () => {
    for (const action of [undefined, null, {}, "link", { type: 3 }]) {
      expect(() => pricingButtonHref(action, "start")).toThrow(PricingActionError)
    }
  })

  it("a funnel action with no tariff throws", () => {
    for (const type of ["onboarding_free", "pay_first"]) {
      expect(() => pricingButtonHref({ type }, null)).toThrow("needs a tariff id")
      expect(() => pricingButtonHref({ type }, "Bad Id")).toThrow("needs a tariff id")
    }
  })

  it("a link that could run code, or no href at all, throws", () => {
    for (const href of ["javascript:alert(1)", "//evil.test", "", undefined]) {
      expect(() => pricingButtonHref({ type: "link", href }, null)).toThrow(PricingActionError)
    }
  })
})

describe("parseTariffEntry", () => {
  it("is null for the old funnels, which carry no tariff", () => {
    expect(parseTariffEntry({})).toBeNull()
  })

  it("reads what pricingButtonHref wrote", () => {
    expect(parseTariffEntry({ tariff: "growth" })).toEqual({ tariff: "growth", trialDays: null })
    expect(parseTariffEntry({ tariff: "scale", trial: "14" })).toEqual({
      tariff: "scale",
      trialDays: 14,
    })
  })

  it("throws on a hand-edited link rather than guessing", () => {
    expect(() => parseTariffEntry({ tariff: "" })).toThrow(PricingActionError)
    expect(() => parseTariffEntry({ tariff: ["a", "b"] })).toThrow(PricingActionError)
    expect(() => parseTariffEntry({ tariff: "start", trial: "0" })).toThrow(PricingActionError)
    expect(() => parseTariffEntry({ tariff: "start", trial: "7d" })).toThrow(PricingActionError)
    expect(() => parseTariffEntry({ tariff: "start", trial: "400" })).toThrow(PricingActionError)
  })
})
