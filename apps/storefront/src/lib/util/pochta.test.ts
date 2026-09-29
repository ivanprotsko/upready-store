import { describe, expect, it } from "vitest"

import { compactWorkTime, pochtaPointOf, pochtaQuoteLabel, type PochtaQuote } from "./pochta"

describe("compactWorkTime", () => {
  it("folds a week of equal days into one run", () => {
    const week = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"].map(
      (day) => `${day}, открыто: 09:00 - 21:00`
    )
    expect(compactWorkTime(week)).toBe("пн–вс 09:00 - 21:00")
  })

  it("keeps runs apart where the hours change", () => {
    expect(
      compactWorkTime([
        "пн, открыто: 10:00 - 20:00",
        "вт, открыто: 10:00 - 20:00",
        "сб, открыто: 10:00 - 19:00",
        "вс, закрыто",
      ])
    ).toBe("пн–вт 10:00 - 20:00; сб 10:00 - 19:00; вс закрыто")
  })

  it("leaves lines it cannot read as they are", () => {
    expect(compactWorkTime(["круглосуточно"])).toBe("круглосуточно")
  })
})

describe("pochtaPointOf", () => {
  it("reads only what the provider recorded", () => {
    expect(
      pochtaPointOf({ shipping_methods: [{ data: { pochta_point_index: "980063" } }] })
    ).toBeNull()
    expect(
      pochtaPointOf({
        shipping_methods: [
          { data: { provider: "cdek" } },
          {
            data: {
              provider: "pochta",
              pochta_point_index: "980063",
              pochta_point_address: "пр-кт Ленинский, 148",
              term_label: "1 день",
            },
          },
        ],
      })
    ).toMatchObject({
      pochta_point_index: "980063",
      pochta_point_kind: "pvz",
      pochta_point_address: "пр-кт Ленинский, 148",
      term_label: "1 день",
    })
  })
})

describe("pochtaQuoteLabel (U-10, 46df)", () => {
  const quote = (tariff_source: PochtaQuote["tariff_source"]): PochtaQuote => ({
    amount: 28901,
    carrier_amount: 28901,
    period_min: 1,
    period_max: 1,
    term_label: "1 день",
    tariff_source,
    weight_g: 200,
  })
  const price = (amount: number) => `${(amount / 100).toFixed(2).replace(".", ",")} ₽`

  it("shows the regional estimate as the plain price, because the buyer is charged exactly that", () => {
    expect(pochtaQuoteLabel(quote("public-retail-estimate"), price)).toBe("289,01 ₽ · 1 день")
  })

  it("shows an office price the same way", () => {
    expect(pochtaQuoteLabel(quote("public-retail"), price)).toBe("289,01 ₽ · 1 день")
  })

  it("leaves out an empty term", () => {
    expect(pochtaQuoteLabel({ ...quote("otpravka"), term_label: "" }, price)).toBe("289,01 ₽")
  })
})
