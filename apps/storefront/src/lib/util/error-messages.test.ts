import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { ERROR_MESSAGE_KEYS, resolveErrorKey } from "./error-messages"

/**
 * t-2026-10-04-23, rule 5ze item 3: a refusal the buyer can trigger at
 * place-order maps to a message that says what to fix, and «Что-то пошло не
 * так» is left for a truly unknown error. The inputs are the backend's own
 * texts.
 */
describe("resolveErrorKey: place-order refusals", () => {
  it("names an incomplete address (validate-cart-shipping-address.ts)", () => {
    expect(
      resolveErrorKey(
        "The shipping address is missing postal_code, city, province. A parcel cannot be posted without them."
      )
    ).toBe("shippingAddressIncomplete")
  })

  it("names a missing shipping method (Medusa validateShippingStep)", () => {
    expect(
      resolveErrorKey(
        "No shipping method selected but the cart contains items that require shipping."
      )
    ).toBe("shippingMethodMissing")
    expect(
      resolveErrorKey(
        "The cart items require shipping profiles that are not satisfied by the current shipping methods"
      )
    ).toBe("shippingMethodMissing")
  })

  it("names a missing Russian Post pickup point (validate-cart-pochta-point.ts)", () => {
    expect(
      resolveErrorKey(
        "Выберите пункт выдачи Почты России: без него заказ нельзя передать на доставку."
      )
    ).toBe("pickupPointMissing")
  })

  it("names an item another channel sells (validate-cart-sales-channel.ts)", () => {
    expect(
      resolveErrorKey("Variants variant_1 are not sold in the cart's sales channel.")
    ).toBe("itemUnavailable")
  })

  it("passes a key a server action answered with through as it is", () => {
    for (const key of ERROR_MESSAGE_KEYS) {
      expect(resolveErrorKey(key)).toBe(key)
    }
  })

  it("keeps the generic text for an unknown error, Next's redacted one included", () => {
    expect(resolveErrorKey("Something odd")).toBe("generic")
    expect(
      resolveErrorKey(
        "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details."
      )
    ).toBe("generic")
  })

  it("every key has a text in ru.json and en.json", () => {
    for (const locale of ["ru", "en"]) {
      const catalog = JSON.parse(
        readFileSync(path.resolve(__dirname, `../../../messages/${locale}.json`), "utf8")
      ) as { Errors: Record<string, string> }
      for (const key of ERROR_MESSAGE_KEYS) {
        expect(catalog.Errors[key], `${locale}: Errors.${key}`).toBeTruthy()
      }
    }
  })
})
