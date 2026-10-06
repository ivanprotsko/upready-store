import { describe, expect, it } from "vitest"

import { linesToCarry } from "./bot-cart"

describe("linesToCarry", () => {
  it("carries a site line whose variant the bot's cart does not hold", () => {
    expect(
      linesToCarry(
        [{ variant_id: "variant_mug", quantity: 2 }],
        [{ variant_id: "variant_tea", quantity: 1 }]
      )
    ).toEqual([{ variant_id: "variant_mug", quantity: 2 }])
  })

  it("keeps the bot's quantity for a variant both carts hold", () => {
    expect(
      linesToCarry(
        [
          { variant_id: "variant_tea", quantity: 4 },
          { variant_id: "variant_mug", quantity: 1 },
        ],
        [{ variant_id: "variant_tea", quantity: 1 }]
      )
    ).toEqual([{ variant_id: "variant_mug", quantity: 1 }])
  })

  it("carries every line of the site cart into an empty bot cart, with its metadata", () => {
    expect(
      linesToCarry(
        [
          { variant_id: "variant_mug", quantity: 1, metadata: { engraving: "Оксане" } },
          { variant_id: "variant_tea", quantity: 3, metadata: {} },
        ],
        []
      )
    ).toEqual([
      { variant_id: "variant_mug", quantity: 1, metadata: { engraving: "Оксане" } },
      { variant_id: "variant_tea", quantity: 3 },
    ])
  })

  it("has nothing to carry from an empty site cart", () => {
    expect(linesToCarry([], [{ variant_id: "variant_tea", quantity: 1 }])).toEqual([])
  })

  it("skips a line it could not add: no variant, or no quantity", () => {
    expect(
      linesToCarry(
        [
          { variant_id: null, quantity: 1 },
          { variant_id: "variant_mug", quantity: 0 },
          { variant_id: "variant_tea", quantity: null },
        ],
        []
      )
    ).toEqual([])
  })
})
