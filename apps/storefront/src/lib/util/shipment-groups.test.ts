import { describe, expect, it } from "vitest"

import {
  DIGITAL_GROUP_KEY,
  isDigitalCartLine,
  physicalGroupKey,
  shipmentGroups,
} from "./shipment-groups"

const line = (id: string, digital = false, locationId?: string) => ({
  id,
  digital,
  locationId,
})

describe("shipmentGroups (batch 5, «Отправление № N»)", () => {
  it("gives no groups for an empty cart", () => {
    expect(shipmentGroups([])).toEqual([])
  })

  it("puts every physical line into «Отправление № 1», even when it is alone", () => {
    const groups = shipmentGroups([line("a"), line("b")])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      key: physicalGroupKey(),
      no: 1,
      kind: "physical",
    })
    expect(groups[0].lines.map((l) => l.id)).toEqual(["a", "b"])
  })

  it("keeps a course in its own group with no number, after the parcels", () => {
    const groups = shipmentGroups([line("course", true), line("kit")])
    expect(groups.map((g) => [g.kind, g.no])).toEqual([
      ["physical", 1],
      ["digital", null],
    ])
    expect(groups[1].key).toBe(DIGITAL_GROUP_KEY)
    expect(groups[1].lines[0].id).toBe("course")
  })

  it("a course alone is one digital group and nothing else", () => {
    expect(shipmentGroups([line("course", true)])).toEqual([
      {
        key: DIGITAL_GROUP_KEY,
        no: null,
        kind: "digital",
        lines: [line("course", true)],
      },
    ])
  })

  it("numbers one physical group per warehouse, in key order, once lines carry a location", () => {
    const groups = shipmentGroups([
      line("c", false, "sloc_b"),
      line("a", false, "sloc_a"),
      line("b", false, "sloc_b"),
    ])
    expect(groups.map((g) => [g.key, g.no])).toEqual([
      ["physical:sloc_a", 1],
      ["physical:sloc_b", 2],
    ])
    expect(groups[1].lines.map((l) => l.id)).toEqual(["c", "b"])
  })

  it("keeps the extra fields of a line", () => {
    const groups = shipmentGroups([{ ...line("a"), item: { title: "x" } }])
    expect(groups[0].lines[0]).toHaveProperty("item", { title: "x" })
  })
})

describe("isDigitalCartLine", () => {
  const item = (metadata: unknown) =>
    ({ product: { metadata } }) as unknown as Parameters<typeof isDigitalCartLine>[0]

  it("reads the product's metadata.digital, the checkout's own contract", () => {
    expect(isDigitalCartLine(item({ digital: "true" }))).toBe(true)
    expect(isDigitalCartLine(item({ digital: "false" }))).toBe(false)
    expect(isDigitalCartLine(item({}))).toBe(false)
    expect(isDigitalCartLine(item(null))).toBe(false)
    expect(
      isDigitalCartLine({} as unknown as Parameters<typeof isDigitalCartLine>[0])
    ).toBe(false)
  })
})
