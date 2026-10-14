import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * t-2026-10-14-58, the live price check of 14.10: in с. Константиново (391103) the
 * CDEK pickup card said «Недоступно: не удалось рассчитать стоимость» where the
 * village simply has no CDEK point. The section is a large client component wired
 * to server actions, so its wiring is asserted on the source (the convention of
 * `remarks.test.ts`); the choice of sentence is tested in `lib/util/shipping-card.test.ts`
 * and the backend's code in `lib/data/fulfillment.test.ts`.
 */

const shipping = readFileSync(join(__dirname, "index.tsx"), "utf8")
const messagesDir = join(__dirname, "../../../../../messages")

describe("a place with no pickup point of the carrier", () => {
  it("keeps the options the backend answered «no points» for apart from a failed price", () => {
    expect(shipping).toMatch(/priced\.error === "no_points"\) return \{ id: sm\.id, noPoints: true \}/)
    expect(shipping).toMatch(/else if \("noPoints" in r\.value\) noPoints\.add\(r\.value\.id\)/)
    expect(shipping).toMatch(/setNoPointsIds\(noPoints\)/)
  })

  it("words the card through shippingCardReason, so a failed price keeps its old sentence", () => {
    expect(shipping).toMatch(/const reasonKey = shippingCardReason\(\{/)
    expect(shipping).toMatch(/: noPoints\s*\?\s*t\(reasonKey\)\s*:\s*"—"/)
  })

  it("leaves a Russian Post card choosable: its sheet finds points in another city", () => {
    expect(shipping).toMatch(/pricedPerPoint: isPochtaOption\(option\)/)
    expect(shipping).toMatch(/const isReason = unpriced \|\| \(noPoints && !isLoadingPrices\)/)
  })

  it("has the three sentences in every language of the storefront", () => {
    const files = readdirSync(messagesDir).filter((name) => name.endsWith(".json"))
    expect(files.length).toBeGreaterThan(30)
    for (const name of files) {
      const page = JSON.parse(readFileSync(join(messagesDir, name), "utf8")).CheckoutPage
      for (const key of ["shippingNoCdekPoints", "shippingNoCdekPointsCourier", "shippingNoPochtaPoints"]) {
        expect(typeof page?.[key], `${name}: ${key}`).toBe("string")
        expect(page[key].length, `${name}: ${key}`).toBeGreaterThan(10)
      }
    }
  })
})
