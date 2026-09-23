import { describe, expect, it } from "vitest"

import { footerLegalLinks, NO_TENANT } from "./legal-links"

const FALLBACK = { terms: "Условия использования", privacy: "Политика конфиденциальности" }

describe("footerLegalLinks (audit B-01)", () => {
  it("links the tenant's offer and privacy policy, titled by the pages themselves", () => {
    const links = footerLegalLinks(
      { hasTenant: true, pageKeys: ["about", "offer", "privacy"] },
      { offer: "Публичная оферта", privacy: "Политика обработки персональных данных" },
      FALLBACK
    )

    expect(links).toEqual([
      { slot: "terms", href: "/pages/offer", label: "Публичная оферта" },
      {
        slot: "privacy",
        href: "/pages/privacy",
        label: "Политика обработки персональных данных",
      },
    ])
  })

  it("falls back to the generic title for a page kept out of the footer list", () => {
    expect(
      footerLegalLinks({ hasTenant: true, pageKeys: ["privacy"] }, {}, FALLBACK)
    ).toEqual([
      { slot: "privacy", href: "/pages/privacy", label: "Политика конфиденциальности" },
    ])
  })

  it("renders nothing for a tenant with no legal pages", () => {
    expect(
      footerLegalLinks({ hasTenant: true, pageKeys: ["about"] }, {}, FALLBACK)
    ).toEqual([])
  })

  it("renders nothing without a tenant: no links to starter placeholders", () => {
    expect(footerLegalLinks(NO_TENANT, {}, FALLBACK)).toEqual([])
  })
})
