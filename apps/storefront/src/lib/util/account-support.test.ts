import { describe, expect, it } from "vitest"

import { accountSupport } from "./account-support"
import { NO_TENANT } from "./legal-links"

describe("accountSupport", () => {
  it("sends a shop's buyer to the shop's contacts, under that name", () => {
    expect(accountSupport({ hasTenant: true, pageKeys: ["offer", "contacts"] })).toEqual({
      text: "shopQuestions",
      label: "contacts",
      href: "/pages/contacts",
    })
  })

  it("prefers the contacts page to a support page, so the name matches the page", () => {
    expect(accountSupport({ hasTenant: true, pageKeys: ["faq", "contacts"] }).href).toBe(
      "/pages/contacts"
    )
  })

  it("keeps a shop's support page when it has no contacts page", () => {
    expect(accountSupport({ hasTenant: true, pageKeys: ["support"] }).href).toBe("/pages/support")
  })

  it("shows no link at all for a shop with neither page", () => {
    expect(accountSupport({ hasTenant: true, pageKeys: ["offer"] }).href).toBeNull()
  })

  it("leaves a host with no shop on the starter's text, name and page", () => {
    expect(accountSupport(NO_TENANT)).toEqual({
      text: "faqDescription",
      label: "customerService",
      href: "/customer-service",
    })
  })
})
