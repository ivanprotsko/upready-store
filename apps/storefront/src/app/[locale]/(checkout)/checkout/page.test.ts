import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * A-11 (46df audit, L1): a buyer with no cart hit `/checkout` and got a 404
 * ("Page not found") — a buyer whose cart expired, or who followed a stale
 * bookmark, is better sent to the cart than told the page does not exist.
 * Async Server Component, no renderer here — asserted on source, the same
 * convention `(main)/reset-password/page.test.ts` already uses for this shape.
 */

const here = dirname(fileURLToPath(import.meta.url))
const pageSource = readFileSync(join(here, "page.tsx"), "utf8")

describe("CheckoutPage: no cart redirects to the cart, not a 404", () => {
  it("never imports notFound", () => {
    expect(pageSource).not.toContain("notFound")
  })

  it("redirects to /<locale>/cart before rendering anything for an absent cart", () => {
    const guardIndex = pageSource.indexOf("if (!initialCart)")
    const redirectIndex = pageSource.indexOf("redirect(`/${locale}/cart`)")
    const formIndex = pageSource.indexOf("<PaymentWrapper")
    expect(guardIndex).not.toBe(-1)
    expect(redirectIndex).toBeGreaterThan(guardIndex)
    expect(redirectIndex).toBeLessThan(formIndex)
  })
})
