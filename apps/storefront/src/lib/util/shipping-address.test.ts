import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import type { HttpTypes } from "@medusajs/types"
import { createTranslator } from "next-intl"
import {
  addressGapMessages,
  addressGapSentences,
  cartHasStaleShipping,
  cartShippingAddressGaps,
  isPickupCart,
  requiresProvince,
  shippingAddressGaps,
} from "./shipping-address"

const full = {
  address_1: "ул. Ленина, д. 1, кв. 2",
  postal_code: "101000",
  city: "Москва",
  province: "г Москва",
}

const cartWith = (
  shipping_address: Record<string, unknown> | null,
  metadata: Record<string, unknown> | null = null
) =>
  ({ shipping_address, metadata } as unknown as HttpTypes.StoreCart)

describe("shippingAddressGaps", () => {
  it("accepts a complete Russian address", () => {
    expect(shippingAddressGaps(full, "ru")).toEqual([])
  })

  it("names every missing field of the order f04 was filed for", () => {
    expect(
      shippingAddressGaps(
        { address_1: "ул. Ленина, д. 1, кв. 2", city: "", postal_code: "", province: "" },
        "ru"
      )
    ).toEqual(["postal_code", "city", "province"])
  })

  it("treats whitespace as empty", () => {
    expect(shippingAddressGaps({ ...full, city: "   " }, "ru")).toEqual(["city"])
  })

  it("reports the address line itself", () => {
    expect(shippingAddressGaps(null, "ru")).toEqual([
      "address_1",
      "postal_code",
      "city",
      "province",
    ])
  })

  it("asks for a province only where a region list exists", () => {
    expect(shippingAddressGaps({ ...full, province: "" }, "de")).toEqual([])
    expect(shippingAddressGaps({ ...full, province: "" }, "RU")).toEqual(["province"])
    expect(shippingAddressGaps({ ...full, province: "" }, null)).toEqual([])
  })
})

describe("requiresProvince", () => {
  it("is case-insensitive and safe on an absent country", () => {
    expect(requiresProvince("ru")).toBe(true)
    expect(requiresProvince("RU")).toBe(true)
    expect(requiresProvince("us")).toBe(false)
    expect(requiresProvince(undefined)).toBe(false)
  })
})

describe("cartShippingAddressGaps", () => {
  it("blocks a courier cart with no city", () => {
    expect(
      cartShippingAddressGaps(
        cartWith({ ...full, city: "", postal_code: "", country_code: "ru" })
      )
    ).toEqual(["postal_code", "city"])
  })

  it("lets a pickup cart through, address deliberately blanked", () => {
    const pickup = cartWith(
      { address_1: "", city: "", postal_code: "", province: "", country_code: "ru" },
      { pickup_point_id: "so_01PICKUP", pickup_point_name: "ПВЗ на Ленина" }
    )
    expect(isPickupCart(pickup)).toBe(true)
    expect(cartShippingAddressGaps(pickup)).toEqual([])
  })

  it("passes a complete courier cart", () => {
    expect(
      cartShippingAddressGaps(cartWith({ ...full, country_code: "ru" }))
    ).toEqual([])
  })
})

describe("addressGapMessages (U-08, 46df; t-2026-09-24-n19)", () => {
  it("names the province on its own, so the buyer is not left guessing which field is missing", () => {
    expect(addressGapMessages(["province"])).toEqual([{ key: "provinceRequired" }])
  })

  it("lists exactly the typed fields that are missing, in the form's order", () => {
    expect(addressGapMessages(["postal_code", "city"])).toEqual([
      { key: "addressIncomplete", fields: ["postal_code", "city"] },
    ])
  })

  it("names the street alone when only the street is missing, not city and index", () => {
    expect(addressGapMessages(["address_1"])).toEqual([
      { key: "addressIncomplete", fields: ["address_1"] },
    ])
  })

  it("says both when both are missing", () => {
    expect(addressGapMessages(["address_1", "province"])).toEqual([
      { key: "addressIncomplete", fields: ["address_1"] },
      { key: "provinceRequired" },
    ])
  })

  it("says nothing for a complete address", () => {
    expect(addressGapMessages([])).toEqual([])
  })
})

const MESSAGES_DIR = path.resolve(__dirname, "../../../messages")
const catalog = (locale: string) =>
  JSON.parse(readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), "utf8"))
const sentencesIn = (locale: string, gaps: Parameters<typeof addressGapSentences>[0]) =>
  addressGapSentences(
    gaps,
    createTranslator({ locale, messages: catalog(locale), namespace: "CheckoutPage" }),
    locale
  )

/**
 * t-2026-09-24-n19, measured on a stand on 30.09: a cart addressed through the
 * store API with street, city and index but no region, and one with region,
 * city and index but no street, both read «Без города и почтового индекса заказ
 * не отправить» above «Оплатить». These run the real catalogs.
 */
describe("addressGapSentences (t-2026-09-24-n19)", () => {
  it("a cart missing only the region is asked for the region, not for city and index", () => {
    expect(sentencesIn("ru", ["province"])).toEqual(["Выберите область из списка."])
    expect(sentencesIn("en", ["province"])).toEqual(["Choose your region from the list."])
  })

  it("a cart missing only the street is asked for the street, under the label its input carries", () => {
    expect(sentencesIn("ru", ["address_1"])).toEqual([
      "Заполните обязательные поля адреса: Адрес.",
    ])
    expect(sentencesIn("en", ["address_1"])).toEqual([
      "Fill in the required address fields: Address.",
    ])
  })

  it("names every missing typed field, joined the way the locale joins a list", () => {
    expect(sentencesIn("ru", ["address_1", "postal_code", "city", "province"])).toEqual([
      "Заполните обязательные поля адреса: Адрес, Почтовый индекс и Город.",
      "Выберите область из списка.",
    ])
    expect(sentencesIn("en", ["postal_code", "city"])).toEqual([
      "Fill in the required address fields: Postal code and City.",
    ])
  })

  it("every catalog names the missing field in the sentence, none of them a fixed text", () => {
    const locales = readdirSync(MESSAGES_DIR)
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.replace(/\.json$/, ""))
    expect(locales).toHaveLength(36)
    for (const locale of locales) {
      const label = catalog(locale).CheckoutPage.fieldPostalCode
      const [sentence] = sentencesIn(locale, ["postal_code"])
      expect(sentence, locale).toContain(label)
    }
  })
})

describe("cartHasStaleShipping (t-2026-10-04-23)", () => {
  const course = { requires_shipping: true, product: { metadata: { digital: "true" } } }
  const kettle = { requires_shipping: true, product: { metadata: null } }
  const dhl = { amount: 3500 }
  const digitalDelivery = { amount: 0 }
  const cart = (items: unknown[], shipping_methods: unknown[]) =>
    ({ items, shipping_methods } as unknown as HttpTypes.StoreCart)

  it("flags DHL left on a course-only cart (the stand cart, 18 900 + 3 500 ₽)", () => {
    expect(cartHasStaleShipping(cart([course], [dhl]))).toBe(true)
  })

  it("leaves the ₽0 digital-delivery method alone", () => {
    expect(cartHasStaleShipping(cart([course], [digitalDelivery]))).toBe(false)
  })

  it("leaves a mixed cart and a physical cart alone", () => {
    expect(cartHasStaleShipping(cart([course, kettle], [dhl]))).toBe(false)
    expect(cartHasStaleShipping(cart([kettle], [dhl]))).toBe(false)
  })

  it("leaves an empty cart and a cart without methods alone", () => {
    expect(cartHasStaleShipping(cart([], [dhl]))).toBe(false)
    expect(cartHasStaleShipping(cart([course], []))).toBe(false)
  })
})

describe("isPostalCodeValid (t-2026-10-09-56, item 9)", () => {
  it("takes a Russian postcode of six digits only", async () => {
    const { isPostalCodeValid } = await import("@lib/util/shipping-address")
    expect(isPostalCodeValid("190000", "ru")).toBe(true)
    expect(isPostalCodeValid(" 190000 ", "RU")).toBe(true)
    expect(isPostalCodeValid("80571", "ru")).toBe(false)
    expect(isPostalCodeValid("1900001", "ru")).toBe(false)
    expect(isPostalCodeValid("19000a", "ru")).toBe(false)
  })

  it("leaves an empty postcode to shippingAddressGaps and other countries alone", async () => {
    const { isPostalCodeValid } = await import("@lib/util/shipping-address")
    expect(isPostalCodeValid("", "ru")).toBe(true)
    expect(isPostalCodeValid("10118", "us")).toBe(true)
    expect(isPostalCodeValid("SW1A 1AA", "gb")).toBe(true)
  })
})
