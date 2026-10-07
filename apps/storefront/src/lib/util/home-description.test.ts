import { describe, expect, it } from "vitest"

import { heroIsDrawn, homeBlockOrder, homeDescription } from "./home-description"

const NEUTRAL = "Каталог товаров магазина, условия доставки и оплаты."
const OWN = "Мёд и травяные чаи с небольшой пасеки."
const ORDER = ["hero", "categories", "products"] as const

const shop = { olavka: false, hero: "k", savedOrder: ORDER, subtitle: OWN, neutral: NEUTRAL }

describe("homeDescription", () => {
  it("takes the shop's own text when the hero is drawn and the owner wrote one", () => {
    expect(homeDescription(shop)).toBe(OWN)
  })

  it("gives an Olavka shop the neutral line even with its own text saved", () => {
    expect(homeDescription({ ...shop, olavka: true })).toBe(NEUTRAL)
  })

  it("gives the neutral line when the hero variant is none", () => {
    expect(homeDescription({ ...shop, hero: "none" })).toBe(NEUTRAL)
  })

  it("gives the neutral line when the saved order has no hero", () => {
    expect(homeDescription({ ...shop, savedOrder: ["categories", "products"] })).toBe(NEUTRAL)
  })

  it("gives the neutral line for a shop that wrote no text", () => {
    for (const subtitle of [undefined, null, "", "   "]) {
      expect(homeDescription({ ...shop, subtitle })).toBe(NEUTRAL)
    }
  })

  it("strips markup from the owner's text, as every other description does", () => {
    expect(homeDescription({ ...shop, subtitle: "<b>Мёд</b>   с пасеки" })).toBe("Мёд с пасеки")
  })
})

describe("the hero block of the home page", () => {
  it("is left out of an Olavka shop's order and stays in any other shop's", () => {
    expect(homeBlockOrder(ORDER, true)).toEqual(["categories", "products"])
    expect(homeBlockOrder(ORDER, false)).toEqual(ORDER)
  })

  it("is drawn only with a variant other than none and a place in the order", () => {
    expect(heroIsDrawn({ olavka: false, hero: "k", savedOrder: ORDER })).toBe(true)
    expect(heroIsDrawn({ olavka: true, hero: "k", savedOrder: ORDER })).toBe(false)
    expect(heroIsDrawn({ olavka: false, hero: "none", savedOrder: ORDER })).toBe(false)
    expect(heroIsDrawn({ olavka: false, hero: "k", savedOrder: ["products"] })).toBe(false)
  })
})
