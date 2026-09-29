import { describe, expect, it } from "vitest"

import { compactWorkTime, pochtaPointOf } from "./pochta"

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
