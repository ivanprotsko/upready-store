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

/** The same shop with the five pages of b14-pages-legal-content published. */
const OKSANA_AFTER: LegalLinkContext = {
  hasTenant: true,
  pageKeys: [
    "about",
    "contacts",
    "delivery",
    "faq",
    "legal",
    "offer",
    "privacy",
    "returns",
    "terms",
  ],
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

  /**
   * b14-pages-legal-content: the same shop after the five pages this task
   * drafts (`delivery`, `faq`, `returns`, `legal`, `terms`) are published.
   */
  it("separates the contract, the usage terms and the return policy", () => {
    expect(legalHref("terms", OKSANA_AFTER)).toBe("/pages/offer")
    expect(legalHref("termsOfUse", OKSANA_AFTER)).toBe("/pages/terms")
    expect(legalHref("returns", OKSANA_AFTER)).toBe("/pages/returns")
    expect(
      new Set([
        legalHref("terms", OKSANA_AFTER),
        legalHref("termsOfUse", OKSANA_AFTER),
        legalHref("returns", OKSANA_AFTER),
      ]).size
    ).toBe(3)
  })

  it("resolves the delivery page and the FAQ once the shop writes them", () => {
    expect(legalHref("shipping", OKSANA_AFTER)).toBe("/pages/delivery")
    expect(legalHref("support", OKSANA_AFTER)).toBe("/pages/faq")
  })

  it("never resolves the requisites page as the contract", () => {
    const shop = { hasTenant: true, pageKeys: ["legal", "contacts"] }
    expect(legalHref("terms", shop)).toBeNull()
    expect(legalHref("termsOfUse", shop)).toBeNull()
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
    expect(consentHref("termsOfUse", BARE_TENANT)).toBeNull()
  })

  it("keeps sending the usage-terms chunk to the contract while the shop has no such page", () => {
    expect(consentHref("termsOfUse", OKSANA)).toBe("/pages/offer")
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
