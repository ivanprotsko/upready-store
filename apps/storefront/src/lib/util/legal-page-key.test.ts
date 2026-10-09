import { describe, expect, it } from "vitest"

import { tenantPageKeyOf } from "@lib/util/legal-page-key"

/** t-2026-10-09-56, Ivan's item 12: only a shop's own page opens over the checkout. */
describe("tenantPageKeyOf", () => {
  it("reads the key of a tenant page", () => {
    expect(tenantPageKeyOf("/pages/delivery")).toBe("delivery")
    expect(tenantPageKeyOf("/pages/%D0%BE%D1%84%D0%B5%D1%80%D1%82%D0%B0")).toBe("оферта")
  })

  it("answers null for a starter route, an external address or nothing", () => {
    expect(tenantPageKeyOf("/terms")).toBeNull()
    expect(tenantPageKeyOf("https://example.com/pages/offer")).toBeNull()
    expect(tenantPageKeyOf("/pages/offer/extra")).toBeNull()
    expect(tenantPageKeyOf(null)).toBeNull()
  })
})
