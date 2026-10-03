import { describe, expect, it } from "vitest"

import { cartDeliveryDays, formatDeliveryRange } from "./delivery-estimate"

type Option = Parameters<typeof cartDeliveryDays>[1] extends
  | readonly (infer O)[]
  | null
  | undefined
  ? O
  : never

const option = (
  id: string,
  metadata: Record<string, unknown> | null = null,
  pickup = false
): Option =>
  ({
    id,
    metadata,
    service_zone: { fulfillment_set: { type: pickup ? "pickup" : "shipping" } },
  }) as unknown as Option

describe("cartDeliveryDays (batch 5, the estimate next to «Отправление № N»)", () => {
  it("quotes the shop's single delivery option when it has a term", () => {
    expect(
      cartDeliveryDays({ shipping_methods: [] }, [
        option("so_dhl", { delivery_days_min: "3", delivery_days_max: "10" }),
        option("so_point", { delivery_days_min: "1" }, true),
      ])
    ).toEqual({ min: 3, max: 10 })
  })

  it("says nothing when the single option has no term", () => {
    expect(cartDeliveryDays({ shipping_methods: [] }, [option("so_dhl")])).toBeNull()
  })

  it("says nothing when there is a choice to make", () => {
    expect(
      cartDeliveryDays({ shipping_methods: [] }, [
        option("so_a", { delivery_days_max: "2" }),
        option("so_b", { delivery_days_max: "5" }),
      ])
    ).toBeNull()
  })

  it("prefers the method already on the cart, term or no term", () => {
    const cart = {
      shipping_methods: [{ shipping_option_id: "so_b" }],
    } as unknown as Parameters<typeof cartDeliveryDays>[0]
    expect(
      cartDeliveryDays(cart, [
        option("so_a", { delivery_days_max: "2" }),
        option("so_b", { delivery_days_min: "4", delivery_days_max: "6" }),
      ])
    ).toEqual({ min: 4, max: 6 })
    expect(cartDeliveryDays(cart, [option("so_a", { delivery_days_max: "2" }), option("so_b")])).toBeNull()
    expect(cartDeliveryDays(cart, [option("so_a", { delivery_days_max: "2" })])).toBeNull()
  })

  it("handles no options at all", () => {
    expect(cartDeliveryDays({ shipping_methods: [] }, null)).toBeNull()
    expect(cartDeliveryDays({ shipping_methods: [] }, [])).toBeNull()
  })
})

describe("formatDeliveryRange", () => {
  const now = new Date(2026, 9, 3, 15, 30) // 3 October 2026, local time

  it("is a range in the locale's words, counted from today", () => {
    const text = formatDeliveryRange("ru", now, { min: 3, max: 10 })
    expect(text).toMatch(/^6\s?[–-]\s?13 октября$/)
    expect(formatDeliveryRange("en", now, { min: 3, max: 10 })).toMatch(/6\s?[–-]\s?13 October|October 6\s?[–-]\s?13/)
  })

  it("is one date when both ends meet or only one is known", () => {
    expect(formatDeliveryRange("ru", now, { min: 2, max: 2 })).toBe("5 октября")
    expect(formatDeliveryRange("ru", now, { max: 1 })).toBe("4 октября")
    expect(formatDeliveryRange("ru", now, { min: 1 })).toBe("4 октября")
  })

  it("crosses a month boundary", () => {
    expect(formatDeliveryRange("ru", now, { min: 27, max: 30 })).toMatch(/30 октября.*2 ноября/)
  })

  it("is nothing without a term", () => {
    expect(formatDeliveryRange("ru", now, null)).toBeNull()
    expect(formatDeliveryRange("ru", now, {})).toBeNull()
  })
})
