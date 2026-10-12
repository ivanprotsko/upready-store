import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * t-2026-10-04-19 (P7). The Robokassa rows stand in groups, each under its
 * heading, and the row picked in any group is the method Robokassa opens on.
 * The section is a large client component with the payment providers inside;
 * the wiring is asserted on its source, the convention `consent-init.test.ts`
 * uses, and the grouping and the request it leads to are covered in
 * `lib/util/robokassa-methods.test.ts`.
 */

const section = readFileSync(join(__dirname, "index.tsx"), "utf8")
const robokassaButton = readFileSync(
  join(__dirname, "../payment-button/providers/robokassa.tsx"),
  "utf8"
)

describe("CheckoutPaymentSection: Robokassa methods in groups", () => {
  it("builds the rows from the groups, so the preselected row is the first one shown", () => {
    expect(section).toMatch(
      /groupRobokassaMethods\(\s*robokassaMethodsForCart\(robokassaMethods, cart\.total, robokassaDisabled\)\s*\)/
    )
    expect(section).toMatch(/robokassaGroups\.flatMap\(\(entry\) => entry\.methods\)/)
    expect(section).toMatch(/pickRobokassaMethod\(null, robokassaRows\)/)
  })

  it("heads each group from the catalog and ties every radio of the group to its heading", () => {
    expect(section).toMatch(/heading: tm\(robokassaGroupLabelKey\(entry\.group\)\)/)
    expect(section).toMatch(/aria-describedby=\{section\.headingId \?\? undefined\}/)
    expect(section).toMatch(/id=\{section\.headingId \?\? undefined\}/)
  })

  it("hands the alias of the picked row to the pay button", () => {
    expect(section).toMatch(/const \{ providerId, alias \} = parsePaymentChoice\(value\)/)
    expect(section).toMatch(/setRobokassaMethod\(alias\)/)
    expect(section).toMatch(
      /robokassaMethod=\{isRobokassa\(selectedPaymentMethod\) \? robokassaMethod : null\}/
    )
  })

  it("opens Robokassa with that alias, on the session read at the click", () => {
    expect(robokassaButton).toMatch(
      /robokassaPaymentRequest\(sessionOf\(fresh\)\?\.data, robokassaMethod\)/
    )
  })
})
