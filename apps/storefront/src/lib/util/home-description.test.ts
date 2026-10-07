import { describe, expect, it } from "vitest"

import { homeDescription } from "./home-description"

const NEUTRAL = "Каталог товаров магазина, условия доставки и оплаты."

describe("homeDescription", () => {
  it("takes the shop's own text when the owner wrote one", () => {
    expect(homeDescription("Мёд и травяные чаи с небольшой пасеки.", NEUTRAL)).toBe(
      "Мёд и травяные чаи с небольшой пасеки."
    )
  })

  it("falls back to the neutral line for a shop that wrote none", () => {
    expect(homeDescription(undefined, NEUTRAL)).toBe(NEUTRAL)
    expect(homeDescription(null, NEUTRAL)).toBe(NEUTRAL)
    expect(homeDescription("", NEUTRAL)).toBe(NEUTRAL)
    expect(homeDescription("   ", NEUTRAL)).toBe(NEUTRAL)
  })

  it("strips markup from the owner's text, as every other description does", () => {
    expect(homeDescription("<b>Мёд</b>   с пасеки", NEUTRAL)).toBe("Мёд с пасеки")
  })
})
