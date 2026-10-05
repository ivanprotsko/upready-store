import { describe, expect, it } from "vitest"

import { shippingOptionText } from "./shipping-option-text"

/** The DHL method of cherkashino.com as pass 3 measured it, with its Russian texts beside. */
const DHL = {
  data: {
    carrier: "dhl",
    description:
      "International delivery by DHL Express. The tracking number will be e-mailed to you once the order ships.",
    delivery_hint: "3–10 days",
    i18n: {
      ru: {
        description:
          "Международная доставка DHL Express. Трек-номер придёт письмом после отправки заказа.",
        delivery_hint: "3–10 дней",
      },
    },
  },
}

describe("shippingOptionText", () => {
  it("answers the page language's own text", () => {
    expect(shippingOptionText(DHL, "description", "ru")).toBe(
      "Международная доставка DHL Express. Трек-номер придёт письмом после отправки заказа."
    )
    expect(shippingOptionText(DHL, "delivery_hint", "ru")).toBe("3–10 дней")
  })

  it("answers the base text for a language the method has nothing for", () => {
    expect(shippingOptionText(DHL, "description", "en")).toBe(DHL.data.description)
    expect(shippingOptionText(DHL, "delivery_hint", "de")).toBe("3–10 days")
    expect(shippingOptionText(DHL, "description", undefined)).toBe(DHL.data.description)
  })

  it("falls back to the base text for a key the language entry lacks or leaves blank", () => {
    const partial = { data: { ...DHL.data, i18n: { ru: { description: "  ", delivery_hint: "3–10 дней" } } } }

    expect(shippingOptionText(partial, "description", "ru")).toBe(DHL.data.description)
    expect(shippingOptionText(partial, "delivery_hint", "ru")).toBe("3–10 дней")
  })

  it("answers null when the owner wrote nothing", () => {
    expect(shippingOptionText({ data: null }, "description", "ru")).toBeNull()
    expect(shippingOptionText({ data: { description: "   " } }, "description", "ru")).toBeNull()
    expect(shippingOptionText({ data: { description: 7 } }, "description", "en")).toBeNull()
  })
})
