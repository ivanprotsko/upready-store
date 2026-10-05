import { describe, expect, it } from "vitest"

import {
  deliveryWayOf,
  groupDeliveryWays,
  isShippingCardUnpriced,
  isWayCardMethod,
  lowestDeliveryPrice,
} from "./shipping-card"

describe("isShippingCardUnpriced (U-12, 46df)", () => {
  it("locks a card whose carrier gave no price once pricing has finished", () => {
    expect(
      isShippingCardUnpriced({ priceAmount: null, isLoadingPrices: false, pricedPerPoint: false })
    ).toBe(true)
  })

  it("leaves a card alone while its price is still being fetched", () => {
    expect(
      isShippingCardUnpriced({ priceAmount: null, isLoadingPrices: true, pricedPerPoint: false })
    ).toBe(false)
  })

  it("leaves a priced or free card choosable", () => {
    expect(
      isShippingCardUnpriced({ priceAmount: 37400, isLoadingPrices: false, pricedPerPoint: false })
    ).toBe(false)
    expect(
      isShippingCardUnpriced({ priceAmount: 0, isLoadingPrices: false, pricedPerPoint: false })
    ).toBe(false)
  })

  it("leaves a method priced per pickup point choosable, since its sheet quotes each point", () => {
    expect(
      isShippingCardUnpriced({ priceAmount: null, isLoadingPrices: false, pricedPerPoint: true })
    ).toBe(false)
  })
})

const cdek = (id: string, kind: "courier" | "pickup" | "postamat") => ({
  id,
  provider_id: "cdek_cdek",
  data: { schema: "upready.cdek-method/v1", kind },
})
const pochta = (id: string) => ({
  id,
  provider_id: "pochta_pochta",
  data: { schema: "upready.pochta-method/v1", kind: "pickup" },
})
const tariff = (id: string, carrier: string | null) => ({
  id,
  provider_id: "tariff_tariff",
  data: { schema: "upready.shipping-method/v1", carrier },
})

describe("deliveryWayOf (D10)", () => {
  it("reads a CDEK option's way off its kind", () => {
    expect(deliveryWayOf(cdek("a", "courier"))).toEqual({ way: "courier", carrier: "cdek" })
    expect(deliveryWayOf(cdek("b", "pickup"))).toEqual({ way: "pickup", carrier: "cdek" })
    expect(deliveryWayOf(cdek("c", "postamat"))).toEqual({ way: "pickup", carrier: "cdek" })
  })

  it("sends Russian Post, integrated or the shop's own post_ru tariff, to a point", () => {
    expect(deliveryWayOf(pochta("p"))).toEqual({ way: "pickup", carrier: "pochta" })
    expect(deliveryWayOf(tariff("t", "post_ru"))).toEqual({ way: "pickup", carrier: "pochta" })
  })

  it("leaves the shop's own courier, pickup, DHL and an unnamed tariff out of the cards", () => {
    for (const carrier of ["courier", "pickup", "dhl", "cdek", null]) {
      expect(deliveryWayOf(tariff("t", carrier))).toBeNull()
    }
    expect(deliveryWayOf({ provider_id: "manual_manual", data: null })).toBeNull()
    expect(deliveryWayOf(null)).toBeNull()
  })
})

describe("groupDeliveryWays (D10)", () => {
  it("folds the four cherkashino.ru options into a pickup card and a courier card", () => {
    const options = [
      tariff("post-office", "post_ru"),
      cdek("cdek-door", "courier"),
      cdek("cdek-point", "pickup"),
      pochta("pochta-point"),
    ]
    const grouped = groupDeliveryWays(options)
    expect(grouped?.rest).toEqual([])
    expect(grouped?.cards.map((card) => card.way)).toEqual(["pickup", "courier"])
    expect(grouped?.cards[0].carriers).toEqual(["pochta", "cdek"])
    expect(grouped?.cards[0].options.map((option) => option.id)).toEqual([
      "post-office",
      "cdek-point",
      "pochta-point",
    ])
    expect(grouped?.cards[1].carriers).toEqual(["cdek"])
    expect(grouped?.cards[1].options.map((option) => option.id)).toEqual(["cdek-door"])
  })

  it("draws no card for a way no carrier returned an option for", () => {
    const grouped = groupDeliveryWays([pochta("pochta-point")])
    expect(grouped?.cards.map((card) => card.way)).toEqual(["pickup"])
  })

  it("keeps a second carrier's card when the first carrier is missing", () => {
    const grouped = groupDeliveryWays([cdek("cdek-door", "courier")])
    expect(grouped?.cards.map((card) => card.way)).toEqual(["courier"])
    expect(grouped?.cards[0].carriers).toEqual(["cdek"])
  })

  it("keeps an option of no way as a row after the cards, in its own order", () => {
    const grouped = groupDeliveryWays([
      tariff("own-courier", "courier"),
      cdek("cdek-point", "pickup"),
      tariff("own-pickup", "pickup"),
    ])
    expect(grouped?.cards.map((card) => card.way)).toEqual(["pickup"])
    expect(grouped?.rest.map((option) => option.id)).toEqual(["own-courier", "own-pickup"])
  })

  it("returns null without a carrier integration, so the international DHL list stays as it was", () => {
    expect(groupDeliveryWays([tariff("dhl", "dhl")])).toBeNull()
    expect(groupDeliveryWays([tariff("post-office", "post_ru"), tariff("own", "courier")])).toBeNull()
    expect(groupDeliveryWays([])).toBeNull()
  })
})

describe("lowestDeliveryPrice (D10)", () => {
  it("takes the lowest known price of a card", () => {
    expect(lowestDeliveryPrice([410, 100, null, 361])).toBe(100)
  })

  it("keeps a free option as the lowest", () => {
    expect(lowestDeliveryPrice([385, 0])).toBe(0)
  })

  it("has no number while no option of the card is priced", () => {
    expect(lowestDeliveryPrice([null, null])).toBeNull()
    expect(lowestDeliveryPrice([])).toBeNull()
  })
})

describe("isWayCardMethod (D10)", () => {
  it("names the cart's CDEK, Russian Post and post_ru methods in the summary", () => {
    expect(isWayCardMethod({ data: { provider: "cdek", kind: "pickup" } })).toBe(true)
    expect(isWayCardMethod({ data: { provider: "pochta", pochta_point_index: "101000" } })).toBe(true)
    expect(isWayCardMethod({ data: { carrier: "post_ru", tariff_kind: "per_kg" } })).toBe(true)
  })

  it("leaves DHL, the shop's own courier and a method without data alone", () => {
    expect(isWayCardMethod({ data: { carrier: "dhl", tariff_kind: "flat" } })).toBe(false)
    expect(isWayCardMethod({ data: { carrier: null } })).toBe(false)
    expect(isWayCardMethod({ data: null })).toBe(false)
    expect(isWayCardMethod(null)).toBe(false)
  })
})
