import { describe, expect, it } from "vitest"

import type { ApishipStorePoint } from "@lib/util/apiship"

import { apishipRowOf } from "./rows"

/**
 * t-2026-10-14-58, part B: an ApiShip point as the shared picker draws it. The point is
 * the contract's own example answer of `GET /store/apiship/points` (section 4).
 */

const POINT: ApishipStorePoint = {
  id: 491,
  code: "SPB3",
  name: "На Коломяжском",
  type: 1,
  address: "197341 Санкт-Петербург, пр-т Коломяжский, 28, корп.2, 14-Н",
  city: "Санкт-Петербург",
  region: "Санкт-Петербург",
  postal_code: "197341",
  lat: 60.008152,
  lng: 30.29509,
  work_time: "Пн-Пт 09:00-21:00, Сб-Вс 10:00-19:00",
  phone: "+78123369087",
  note: "Вход со двора.",
  have_cashless: true,
  is_dressing_room: true,
  weight_max: 35000,
}

describe("apishipRowOf", () => {
  it("keys the row by ApiShip's id, the one the cart takes back", () => {
    expect(apishipRowOf(POINT).id).toBe("491")
  })

  it("leads with the carrier's name, then the address with a pin and the hours with a clock", () => {
    const row = apishipRowOf(POINT)
    expect(row.title).toBe("На Коломяжском")
    expect(row.lines).toEqual([
      { icon: "pin", text: POINT.address },
      { icon: "clock", text: "Пн-Пт 09:00-21:00, Сб-Вс 10:00-19:00" },
    ])
    expect(row.extras).toEqual([{ text: "+78123369087" }, { text: "Вход со двора." }])
    expect(row.lat).toBe(60.008152)
    expect(row.searchText).toContain("197341")
  })

  it("draws a locker, a post office and a counter as their own markers", () => {
    expect(apishipRowOf({ ...POINT, type: 2 }).kind).toBe("postamat")
    expect(apishipRowOf({ ...POINT, type: 3 }).kind).toBe("post")
    expect(apishipRowOf({ ...POINT, type: 1 }).kind).toBe("pvz")
    expect(apishipRowOf({ ...POINT, type: 4 }).kind).toBe("pvz")
  })

  it("falls back to the address for a point with no name, and skips missing lines", () => {
    const row = apishipRowOf({ ...POINT, name: "", work_time: null, phone: null, note: null })
    expect(row.title).toBe(POINT.address)
    expect(row.lines).toHaveLength(1)
    expect(row.extras).toEqual([])
  })
})
