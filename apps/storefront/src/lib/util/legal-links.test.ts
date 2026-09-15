import { describe, expect, it } from "vitest"

import {
  consentHref,
  legalHref,
  starterPageVerdict,
  NO_TENANT,
  type LegalLinkContext,
} from "./legal-links"

/**
 * The shop this task was measured against: cherkashino.shipshift.dev on
 * 2026-09-15 had exactly these four pages published, with the checkout still
 * pointing at `/terms`, `/returns` and `/privacy` — three starter placeholders.
 */
const OKSANA: LegalLinkContext = {
  hasTenant: true,
  pageKeys: ["about", "contacts", "offer", "privacy"],
}

const BARE_TENANT: LegalLinkContext = { hasTenant: true, pageKeys: [] }

describe("legalHref", () => {
  it("sends every slot the shop has written to the shop's own page", () => {
    expect(legalHref("terms", OKSANA)).toBe("/pages/offer")
    expect(legalHref("privacy", OKSANA)).toBe("/pages/privacy")
    expect(legalHref("support", OKSANA)).toBe("/pages/contacts")
    expect(legalHref("contact", OKSANA)).toBe("/pages/contacts")
  })

  it("hides a navigation link the shop has no page for", () => {
    expect(legalHref("returns", OKSANA)).toBeNull()
    expect(legalHref("shipping", OKSANA)).toBeNull()
  })

  it("keeps the starter pages for a deployment with no tenant", () => {
    expect(legalHref("terms", NO_TENANT)).toBe("/terms")
    expect(legalHref("returns", NO_TENANT)).toBe("/returns")
    expect(legalHref("support", NO_TENANT)).toBe("/customer-service")
  })

  it("prefers the more specific key when a shop has several", () => {
    const shop = { hasTenant: true, pageKeys: ["offer", "terms", "contacts", "support"] }
    expect(legalHref("terms", shop)).toBe("/pages/offer")
    expect(legalHref("support", shop)).toBe("/pages/support")
  })
})

describe("consentHref", () => {
  it("falls back to the contract for a document the shop folded into it", () => {
    expect(consentHref("returns", OKSANA)).toBe("/pages/offer")
  })

  it("never points a consent link at a starter placeholder on a tenant", () => {
    for (const slot of ["terms", "privacy", "returns"] as const) {
      const href = consentHref(slot, OKSANA)
      expect(href === null || href.startsWith("/pages/")).toBe(true)
    }
  })

  it("renders as plain text when the shop has no legal page at all", () => {
    expect(consentHref("returns", BARE_TENANT)).toBeNull()
    expect(consentHref("terms", BARE_TENANT)).toBeNull()
  })

  it("keeps the starter behaviour with no tenant", () => {
    expect(consentHref("returns", NO_TENANT)).toBe("/returns")
    expect(consentHref("privacy", NO_TENANT)).toBe("/privacy")
  })
})

describe("starterPageVerdict", () => {
  it("still renders the placeholder for a deployment with no tenant", () => {
    expect(starterPageVerdict("terms", NO_TENANT)).toEqual({ kind: "render" })
  })

  it("redirects a tenant's visitor to the shop's own document", () => {
    expect(starterPageVerdict("terms", OKSANA)).toEqual({
      kind: "redirect",
      to: "/pages/offer",
    })
    expect(starterPageVerdict("privacy", OKSANA)).toEqual({
      kind: "redirect",
      to: "/pages/privacy",
    })
  })

  it("answers 404 rather than a placeholder for a page the shop lacks", () => {
    expect(starterPageVerdict("returns", OKSANA)).toEqual({ kind: "gone" })
    expect(starterPageVerdict("shipping", BARE_TENANT)).toEqual({ kind: "gone" })
  })
})
