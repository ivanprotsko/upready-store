import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * t-2026-10-14-58, part B. The section is a large client component wired to server
 * actions; what the ApiShip branch changed in it is asserted on its source, the
 * convention `remarks.test.ts` next door uses, and the logic in
 * `lib/util/apiship.test.ts` and `lib/util/checkout-steps.test.ts`.
 */

const read = (path: string) => readFileSync(join(__dirname, path), "utf8")
const section = read("index.tsx")
const apiship = read("apiship.tsx")
const sheet = read("../checkout-apiship-point-sheet/index.tsx")

describe("«Способ доставки» with ApiShip", () => {
  it("keeps the section from growing: the ApiShip logic lives next to it", () => {
    // 1 024 lines when the task started (lead's brief, 14.10).
    expect(section.split("\n").length).toBeLessThanOrEqual(1025)
    for (const file of [apiship, sheet]) {
      expect(file.split("\n").length).toBeLessThan(800)
    }
  })

  it("opens the point sheet before anything is set for a pickup option", () => {
    expect(section).toMatch(/if \(apiship\.opensSheet\(option\)\) return\n\s*if \(isPochtaOption\(option\)\)/)
  })

  it("sends the point the buyer picked as apiship_point_id", () => {
    expect(apiship).toMatch(/data: \{ apiship_point_id: point\.id \}/)
  })

  it("marks both carriers' address refusals at the card", () => {
    expect(section).toMatch(/return priced\.error !== "other"\s*\?\s*\{ id: sm\.id, addressRejected: true \}/)
  })

  it("counts the step done only with the point, and folds on the point picked", () => {
    expect(section).toMatch(/: apiship\.isComplete\(selectedOption\)\)/)
    expect(section).toMatch(/: apiship\.completionPart\(selectedOption\),/)
    expect(section).toMatch(/\|\| apiship\.sheetOpen/)
  })

  it("prices a chosen point exactly and an unchosen one «от» the city price", () => {
    expect(section).toMatch(/: apiship\.methodAmount\(option\)/)
    expect(section).toMatch(/apiship\.priceText\(option, convertToLocale\(/)
    expect(apiship).toMatch(/t\("deliveryWayFrom", \{ price: formatted \}\)/)
  })

  it("draws the carrier's points through the shared picker, under its own test ids", () => {
    expect(sheet).toMatch(/<PickupPointPicker<ApishipStorePoint>/)
    expect(sheet).toMatch(/testIdPrefix="apiship-point"/)
  })
})
