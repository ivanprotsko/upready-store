import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  APISHIP_STATUS_KEYS,
  apishipKindOf,
  apishipMethodOf,
  apishipNeedsPoint,
  apishipPointLine,
  apishipProviderKeyOf,
  apishipStatusKeyOf,
  fetchApishipPoints,
  isApishipOption,
} from "./apiship"

/**
 * t-2026-10-14-58, part B: the storefront half of the ApiShip contract
 * (`t-2026-10-14-58b-ui-contract.md`, sections 4 and 5). Options and method data
 * are shaped after `apps/backend/src/modules/apiship-fulfillment/service.ts`.
 */

const option = (data: Record<string, unknown> | null, provider_id = "apiship_apiship") => ({
  id: "so_apiship",
  provider_id,
  data,
})

describe("an ApiShip option", () => {
  it("is told by its provider id, whatever the carrier", () => {
    expect(isApishipOption(option({ provider_key: "cdek", kind: "pickup" }))).toBe(true)
    expect(isApishipOption(option({ provider_key: "cdek", kind: "pickup" }, "cdek_cdek"))).toBe(false)
    expect(isApishipOption(null)).toBe(false)
  })

  it("names its carrier and its way off `data`", () => {
    expect(apishipProviderKeyOf(option({ provider_key: "rupost", kind: "pickup" }))).toBe("rupost")
    expect(apishipProviderKeyOf(option(null))).toBeNull()
    expect(apishipKindOf(option({ provider_key: "cdek", kind: "courier" }))).toBe("courier")
    expect(apishipKindOf(option({ provider_key: "cdek", kind: "pickup" }))).toBe("pickup")
  })

  it("asks for a point unless it is a courier one, a missing kind included", () => {
    expect(apishipNeedsPoint(option({ provider_key: "cdek", kind: "pickup" }))).toBe(true)
    expect(apishipNeedsPoint(option({ provider_key: "cdek" }))).toBe(true)
    expect(apishipNeedsPoint(option({ provider_key: "cdek", kind: "courier" }))).toBe(false)
    expect(apishipNeedsPoint(option({ kind: "pickup" }, "cdek_cdek"))).toBe(false)
  })
})

describe("apishipMethodOf", () => {
  const data = {
    provider: "apiship",
    provider_key: "cdek",
    kind: "pickup",
    apiship_point_id: 491,
    apiship_point_code: "SPB3",
    apiship_point_name: "На Коломяжском",
    apiship_point_address: "197341 Санкт-Петербург, пр-т Коломяжский, 28",
    term_label: "2-4 дня",
    tariff_name: "Посылка склад-склад",
  }

  it("reads the point, the term and the tariff the provider wrote", () => {
    const summary = apishipMethodOf({ shipping_methods: [{ data }] })
    expect(summary).toEqual({
      pointId: 491,
      pointName: "На Коломяжском",
      pointAddress: "197341 Санкт-Петербург, пр-т Коломяжский, 28",
      termLabel: "2-4 дня",
      tariffName: "Посылка склад-склад",
    })
    expect(apishipPointLine(summary)).toBe(
      "На Коломяжском, 197341 Санкт-Петербург, пр-т Коломяжский, 28"
    )
  })

  it("has no point for a courier method and nothing for another provider", () => {
    const courier = apishipMethodOf({
      shipping_methods: [{ data: { provider: "apiship", kind: "courier", apiship_point_id: null } }],
    })
    expect(courier?.pointId).toBeNull()
    expect(apishipPointLine(courier)).toBeNull()
    expect(apishipMethodOf({ shipping_methods: [{ data: { provider: "cdek" } }] })).toBeNull()
    expect(apishipMethodOf(null)).toBeNull()
  })
})

describe("apishipStatusKeyOf", () => {
  it("takes the newest shipment's status", () => {
    expect(
      apishipStatusKeyOf([{ data: { apiship_status: "uploaded" } }, { data: { apiship_status: "onWay" } }])
    ).toBe("onWay")
  })

  it("words `pending` as `uploading`, as the backend's map does", () => {
    expect(apishipStatusKeyOf([{ data: { apiship_status: "pending" } }])).toBe("uploading")
  })

  it("shows nothing for no status, `unknown`, `notApplicable` or a key it does not know", () => {
    expect(apishipStatusKeyOf([{ data: {} }])).toBeNull()
    expect(apishipStatusKeyOf([{ data: { apiship_status: "unknown" } }])).toBeNull()
    expect(apishipStatusKeyOf([{ data: { apiship_status: "notApplicable" } }])).toBeNull()
    expect(apishipStatusKeyOf([{ data: { apiship_status: "somethingNew" } }])).toBeNull()
    expect(apishipStatusKeyOf(null)).toBeNull()
  })

  it("has a label for every key in the storefront catalog, the backend's map keys included", () => {
    const en = JSON.parse(readFileSync(join(__dirname, "../../../messages/en.json"), "utf8"))
    expect(Object.keys(en.ApishipStatus).sort()).toEqual([...APISHIP_STATUS_KEYS].sort())
    const backend = readFileSync(
      join(__dirname, "../../../../backend/src/apiship/statuses.ts"),
      "utf8"
    )
    for (const key of APISHIP_STATUS_KEYS) {
      expect(backend).toMatch(new RegExp(`\\b${key}: "`))
    }
  })
})

describe("fetchApishipPoints", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("asks the storefront's own route for one carrier in one city", async () => {
    const answer = { configured: true, provider_key: "cdek", city: "Москва", total: 0, points: [] }
    const fetchMock = vi.fn(async () => Response.json(answer))
    vi.stubGlobal("fetch", fetchMock)
    await expect(fetchApishipPoints({ providerKey: "cdek", city: "Москва" })).resolves.toEqual(answer)
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/apiship/points?provider_key=cdek&city=${encodeURIComponent("Москва")}`,
      { signal: undefined }
    )
  })

  it("answers «not configured» with no points when the route fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })))
    const answer = await fetchApishipPoints({ providerKey: "cdek", city: "Москва" })
    expect(answer.configured).toBe(false)
    expect(answer.points).toEqual([])
  })
})
