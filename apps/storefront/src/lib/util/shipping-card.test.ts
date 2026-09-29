import { describe, expect, it } from "vitest"

import { isShippingCardUnpriced } from "./shipping-card"

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
