import { describe, expect, it } from "vitest"

import { applyStep, cartStep, linesByVariant, maxQuantity } from "./logic"

describe("«В КОРЗИНЕ − N +» state logic (remark 24)", () => {
  it("adds one when the variant is not in the cart", () => {
    expect(cartStep(null, 1)).toEqual({ kind: "add", quantity: 1 })
    expect(applyStep(null, { kind: "add", quantity: 1 })).toEqual({ lineId: "", quantity: 1 })
  })

  it("does nothing on «−» when the variant is not in the cart", () => {
    expect(cartStep(null, -1)).toEqual({ kind: "none" })
  })

  it("«+» on N makes N + 1 on the same line", () => {
    expect(cartStep({ lineId: "li_1", quantity: 2 }, 1)).toEqual({
      kind: "update",
      lineId: "li_1",
      quantity: 3,
    })
  })

  it("«−» on N > 1 makes N − 1", () => {
    expect(cartStep({ lineId: "li_1", quantity: 3 }, -1)).toEqual({
      kind: "update",
      lineId: "li_1",
      quantity: 2,
    })
  })

  it("«−» on 1 removes the line, and the button is «В корзину» again", () => {
    const step = cartStep({ lineId: "li_1", quantity: 1 }, -1)
    expect(step).toEqual({ kind: "remove", lineId: "li_1" })
    expect(applyStep({ lineId: "li_1", quantity: 1 }, step)).toBeNull()
  })

  it("never goes over the stock of a tracked variant without back orders", () => {
    const max = maxQuantity({ manage_inventory: true, allow_backorder: false, inventory_quantity: 2 })
    expect(max).toBe(2)
    expect(cartStep({ lineId: "li_1", quantity: 2 }, 1, max)).toEqual({ kind: "none" })
    expect(cartStep({ lineId: "li_1", quantity: 1 }, 1, max)).toEqual({
      kind: "update",
      lineId: "li_1",
      quantity: 2,
    })
    expect(cartStep(null, 1, maxQuantity({ manage_inventory: true, inventory_quantity: 0 }))).toEqual({
      kind: "none",
    })
  })

  it("has no limit when the stock is not tracked or back orders are allowed", () => {
    expect(maxQuantity({ manage_inventory: false, inventory_quantity: 0 })).toBe(Infinity)
    expect(maxQuantity({ manage_inventory: true, allow_backorder: true, inventory_quantity: 0 })).toBe(
      Infinity
    )
    expect(maxQuantity(undefined)).toBe(Infinity)
  })

  it("maps the cart's lines by variant, the first line of a variant winning", () => {
    expect(
      linesByVariant([
        { id: "li_1", variant_id: "var_a", quantity: 2 },
        { id: "li_2", variant_id: "var_b", quantity: 1 },
        { id: "li_3", variant_id: "var_a", quantity: 5 },
        { id: "li_4", variant_id: null, quantity: 1 },
      ])
    ).toEqual({
      var_a: { lineId: "li_1", quantity: 2 },
      var_b: { lineId: "li_2", quantity: 1 },
    })
    expect(linesByVariant(undefined)).toEqual({})
  })
})
