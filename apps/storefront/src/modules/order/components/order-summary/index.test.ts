import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * U-15 (46df UX audit): a paid order with no tax charged showed a «Налоги 0,00 ₽»
 * row anyway — an empty line that only raises a question for the buyer, never an
 * answer. `OrderSummary` is an async server component this package has no
 * renderer for (no @testing-library/react — see login-render.test.ts), so the
 * gate is asserted on the source directly, the same way `discount`/`giftCard`
 * (already conditional, right above) are.
 */

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, "index.tsx"), "utf8")

describe("OrderSummary: the taxes row only when there IS tax", () => {
  it("wraps the taxes row in order.tax_total > 0, like discount/giftCard already are", () => {
    expect(source).toContain("{order.tax_total > 0 && (")
  })

  it("the taxes label/value still sit right after that guard — not a dead condition elsewhere", () => {
    const guardIndex = source.indexOf("{order.tax_total > 0 && (")
    expect(guardIndex).not.toBe(-1)
    const afterGuard = source.slice(guardIndex, guardIndex + 200)
    expect(afterGuard).toContain('t("taxes")')
    expect(afterGuard).toContain("order-taxes")
  })

  it("an order that DOES have tax keeps the row — the fix is a guard, not a removal", () => {
    // discount/giftCard use the exact same `> 0 &&` shape; taxes now matches them.
    const discountGuards = source.match(/order\.\w+_total > 0 &&/g) ?? []
    expect(discountGuards.length).toBeGreaterThanOrEqual(3) // discount, giftCard, taxes
  })
})
