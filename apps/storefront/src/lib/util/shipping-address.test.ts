import { describe, expect, it } from "vitest"
import type { HttpTypes } from "@medusajs/types"
import {
  addressGapMessageKeys,
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

describe("addressGapMessageKeys (U-08, 46df)", () => {
  it("names the province on its own, so the buyer is not left guessing which field is missing", () => {
    expect(addressGapMessageKeys(["province"])).toEqual(["provinceRequired"])
  })

  it("keeps the general sentence for city, index and street", () => {
    expect(addressGapMessageKeys(["city", "postal_code"])).toEqual(["addressIncomplete"])
  })

  it("says both when both are missing", () => {
    expect(addressGapMessageKeys(["address_1", "province"])).toEqual([
      "addressIncomplete",
      "provinceRequired",
    ])
  })

  it("says nothing for a complete address", () => {
    expect(addressGapMessageKeys([])).toEqual([])
  })
})
