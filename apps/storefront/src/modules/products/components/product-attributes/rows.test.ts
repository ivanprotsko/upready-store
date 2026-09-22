import { describe, expect, it } from "vitest"

import type { ProductAttributeRow } from "@lib/data/product-attributes"

import { displayAttributeValue, prepareAttributeRows, withoutShopTag } from "./rows"

const row = (partial: Partial<ProductAttributeRow>): ProductAttributeRow => ({
  key: "k",
  name: "n",
  type: "text",
  unit: null,
  position: 0,
  value: "v",
  label: null,
  ...partial,
})

describe("withoutShopTag", () => {
  it("drops the shop tag the product's handle ends with", () => {
    expect(withoutShopTag("1199673895-CHERKASHINO", "kastorka-cherkashino")).toBe("1199673895")
  })

  it("leaves a value that does not end with the tag", () => {
    expect(withoutShopTag("Россия", "kastorka-cherkashino")).toBe("Россия")
  })

  it("empties a value that was nothing but the tag", () => {
    expect(withoutShopTag("cherkashino", "kastorka-cherkashino")).toBe("")
  })

  it("does nothing for a numeric handle tail", () => {
    expect(withoutShopTag("abc-42", "product-42")).toBe("abc-42")
  })
})

describe("prepareAttributeRows", () => {
  it("cleans text values and drops rows that were only the tag", () => {
    const rows = prepareAttributeRows(
      [
        row({ key: "sku", value: "12-CHERKASHINO" }),
        row({ key: "tag", value: "CHERKASHINO" }),
        row({ key: "n", type: "number", value: 250, unit: "мл" }),
      ],
      "kastorka-cherkashino"
    )
    expect(rows.map((r) => [r.key, r.value])).toEqual([
      ["sku", "12"],
      ["n", 250],
    ])
  })
})

describe("displayAttributeValue", () => {
  const words = { yes: "Да", no: "Нет" }

  it("says yes or no for a flag, in the visitor's words", () => {
    expect(displayAttributeValue(row({ type: "boolean", value: true }), words)).toBe("Да")
    expect(displayAttributeValue(row({ type: "boolean", value: false }), words)).toBe("Нет")
  })

  it("prefers a choice's label and joins a number to its unit", () => {
    expect(displayAttributeValue(row({ type: "select", value: "ru", label: "Россия" }), words)).toBe("Россия")
    expect(displayAttributeValue(row({ type: "number", value: 250, unit: "мл" }), words)).toBe("250 мл")
    expect(displayAttributeValue(row({ type: "number", value: 3 }), words)).toBe("3")
  })
})
