import { describe, expect, it } from "vitest"

import {
  TIMELINE_STEP_KEYS,
  timelineProgress,
  trackingEntries,
  trackingLines,
} from "./order-tracking"

const order = (over: Partial<Parameters<typeof timelineProgress>[0]> = {}) =>
  ({
    created_at: "2026-09-15T15:11:00.000Z",
    payment_status: "authorized",
    fulfillment_status: "not_fulfilled",
    fulfillments: [],
    payment_collections: [],
    ...over,
  }) as Parameters<typeof timelineProgress>[0]

describe("trackingEntries (t-2026-10-14-58)", () => {
  it("gives each line the carrier's tracking page the label carries", () => {
    expect(
      trackingEntries([
        {
          metadata: { carrier: "СДЭК" },
          labels: [
            {
              tracking_number: "1005248796431",
              tracking_url: "https://www.cdek.ru/ru/tracking?order_id=1005248796431",
            },
          ],
        },
      ])
    ).toEqual([
      {
        line: "СДЭК 1005248796431",
        url: "https://www.cdek.ru/ru/tracking?order_id=1005248796431",
      },
    ])
  })

  it("gives no link for an empty or a non-web tracking_url", () => {
    expect(
      trackingEntries([
        {
          metadata: null,
          labels: [
            { tracking_number: "1", tracking_url: "" },
            { tracking_number: "2", tracking_url: "javascript:alert(1)" },
            { tracking_number: "3" },
          ],
        },
      ]).map((entry) => entry.url)
    ).toEqual([null, null, null])
  })
})

describe("trackingLines", () => {
  it("puts the carrier the owner typed in front of the number", () => {
    expect(
      trackingLines([
        {
          metadata: { carrier: "СДЭК" },
          labels: [{ tracking_number: "1005248796431" }],
        },
      ])
    ).toEqual(["СДЭК 1005248796431"])
  })

  it("gives the bare number when the owner named no carrier", () => {
    expect(
      trackingLines([{ metadata: null, labels: [{ tracking_number: "42" }] }])
    ).toEqual(["42"])
    expect(
      trackingLines([{ metadata: { carrier: "  " }, labels: [{ tracking_number: "42" }] }])
    ).toEqual(["42"])
  })

  it("ignores a carrier that is not a string", () => {
    expect(
      trackingLines([{ metadata: { carrier: 7 }, labels: [{ tracking_number: "42" }] }])
    ).toEqual(["42"])
  })

  it("drops labels without a number and fulfillments without labels", () => {
    expect(
      trackingLines([
        { labels: [{ tracking_number: null }, { tracking_number: " " }] },
        { labels: null },
        { labels: [{ tracking_number: " 7 " }] },
      ])
    ).toEqual(["7"])
  })

  it("is empty for an order that has not been shipped", () => {
    expect(trackingLines([])).toEqual([])
    expect(trackingLines(null)).toEqual([])
    expect(trackingLines(undefined)).toEqual([])
  })

  it("lists every fulfillment of a split order", () => {
    expect(
      trackingLines([
        { metadata: { carrier: "СДЭК" }, labels: [{ tracking_number: "1" }] },
        { metadata: { carrier: "Почта России" }, labels: [{ tracking_number: "2" }] },
      ])
    ).toEqual(["СДЭК 1", "Почта России 2"])
  })
})

describe("timelineProgress", () => {
  it("starts on «confirmed» for a fresh, unpaid order", () => {
    const { done, current } = timelineProgress(order())

    expect(done).toEqual({
      placed: true,
      confirmed: false,
      atPickupPoint: false,
      received: false,
    })
    expect(current).toBe("confirmed")
  })

  it("moves to «atPickupPoint» once the payment is captured", () => {
    const { done, current, dates } = timelineProgress(
      order({
        payment_status: "captured",
        payment_collections: [{ payments: [{ captured_at: "2026-09-15T15:12:00.000Z" }] }],
      })
    )

    expect(done.confirmed).toBe(true)
    expect(current).toBe("atPickupPoint")
    expect(dates.confirmed).toBe("2026-09-15T15:12:00.000Z")
  })

  it("counts a packed order as past the pickup point and dates it by packed_at", () => {
    const { done, current, dates } = timelineProgress(
      order({
        payment_status: "captured",
        fulfillment_status: "fulfilled",
        fulfillments: [{ packed_at: "2026-09-15T15:13:13.519Z", shipped_at: null }],
      })
    )

    expect(done.atPickupPoint).toBe(true)
    expect(done.received).toBe(false)
    expect(current).toBe("received")
    expect(dates.atPickupPoint).toBe("2026-09-15T15:13:13.519Z")
  })

  it("counts a SHIPPED order as past the pickup point too", () => {
    // Medusa moves the order from `fulfilled` to `shipped` the moment the owner
    // marks the shipment; reading only `fulfilled` sent the step back to
    // «upcoming» after the tracking number was entered.
    const { done, dates } = timelineProgress(
      order({
        payment_status: "captured",
        fulfillment_status: "shipped",
        fulfillments: [
          { packed_at: "2026-09-15T15:13:13.519Z", shipped_at: "2026-09-15T15:13:27.529Z" },
        ],
      })
    )

    expect(done.atPickupPoint).toBe(true)
    expect(dates.atPickupPoint).toBe("2026-09-15T15:13:27.529Z")
  })

  it("completes on delivery", () => {
    const { done, current, dates } = timelineProgress(
      order({
        payment_status: "captured",
        fulfillment_status: "delivered",
        fulfillments: [
          {
            packed_at: "2026-09-15T15:13:13.519Z",
            shipped_at: "2026-09-15T15:13:27.529Z",
            delivered_at: "2026-09-17T09:00:00.000Z",
          },
        ],
      })
    )

    expect(Object.values(done).every(Boolean)).toBe(true)
    expect(current).toBeNull()
    expect(dates.received).toBe("2026-09-17T09:00:00.000Z")
  })

  it("never dates a step the order has not reached", () => {
    const { dates } = timelineProgress(order())

    expect(dates.confirmed).toBeNull()
    expect(dates.atPickupPoint).toBeNull()
    expect(dates.received).toBeNull()
  })

  it("walks the four steps in order as the statuses advance", () => {
    const stages = [
      order(),
      order({ payment_status: "captured" }),
      order({ payment_status: "captured", fulfillment_status: "fulfilled" }),
      order({ payment_status: "captured", fulfillment_status: "shipped" }),
      order({ payment_status: "captured", fulfillment_status: "delivered" }),
    ]

    expect(stages.map((stage) => timelineProgress(stage).current)).toEqual([
      "confirmed",
      "atPickupPoint",
      "received",
      "received",
      null,
    ])
  })

  it("draws every step it knows about", () => {
    expect(TIMELINE_STEP_KEYS).toEqual([
      "placed",
      "confirmed",
      "atPickupPoint",
      "received",
    ])
  })
})

describe("trackingEntries: direct СДЭК (t-2026-10-14-58, step C)", () => {
  it("shows the number the СДЭК webhook wrote on the fulfillment, with СДЭК's tracking page", () => {
    expect(
      trackingEntries([{ data: { cdek_order_uuid: "u1", cdek_number: "1110019201" }, labels: [] }])
    ).toEqual([
      { line: "СДЭК 1110019201", url: "https://www.cdek.ru/ru/tracking?order_id=1110019201" },
    ])
  })

  it("takes a numeric cdek_number too", () => {
    expect(trackingEntries([{ data: { cdek_number: 1110019201 } }])[0]?.line).toBe("СДЭК 1110019201")
  })

  it("does not repeat a number the owner already typed on a label", () => {
    expect(
      trackingEntries([
        {
          metadata: { carrier: "СДЭК" },
          labels: [{ tracking_number: "1110019201" }],
          data: { cdek_number: "1110019201" },
        },
      ])
    ).toEqual([{ line: "СДЭК 1110019201", url: null }])
  })

  it("adds nothing before СДЭК has given a number", () => {
    expect(trackingEntries([{ data: { cdek_order_uuid: "u1", cdek_number: null } }])).toEqual([])
  })
})
