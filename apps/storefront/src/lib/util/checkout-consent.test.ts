import { describe, expect, it } from "vitest"
import {
  CHECKOUT_CONSENT_METADATA_KEY,
  CHECKOUT_CONSENT_TEXT_VERSION,
  buildConsentRecord,
  readConsentRecord,
} from "./checkout-consent"

const legal = {
  hasTenant: true,
  pageKeys: ["offer", "privacy"],
  versions: { offer: "2026-09-14T20:07:35.790Z", privacy: "2026-09-14T20:07:36.319Z" },
}
const now = new Date("2026-10-04T08:00:00.000Z")

describe("buildConsentRecord", () => {
  it("stamps the tick time, the wording version and the version of each document", () => {
    const record = buildConsentRecord({ personalData: true, marketing: false }, legal, "ru", now)

    expect(record).toEqual({
      text_version: CHECKOUT_CONSENT_TEXT_VERSION,
      locale: "ru",
      personal_data: {
        given: true,
        at: "2026-10-04T08:00:00.000Z",
        document: { href: "/pages/privacy", version: "2026-09-14T20:07:36.319Z" },
      },
      marketing: { given: false, at: null },
      offer: { document: { href: "/pages/offer", version: "2026-09-14T20:07:35.790Z" } },
    })
  })

  it("keeps the first tick time while the box stays ticked, and clears it when unticked", () => {
    const first = buildConsentRecord({ personalData: true, marketing: true }, legal, "ru", now)
    const later = new Date("2026-10-04T08:05:00.000Z")

    const kept = buildConsentRecord({ personalData: true, marketing: false }, legal, "ru", later, first)
    expect(kept.personal_data.at).toBe("2026-10-04T08:00:00.000Z")
    expect(kept.marketing).toEqual({ given: false, at: null })
  })

  it("records no version for a document the shop has not published", () => {
    const record = buildConsentRecord(
      { personalData: true, marketing: false },
      { hasTenant: true, pageKeys: [] },
      "en",
      now
    )

    expect(record.personal_data.document).toEqual({ href: null, version: null })
  })
})

describe("readConsentRecord", () => {
  it("reads the record back and ignores anything that is not one", () => {
    expect(readConsentRecord({ [CHECKOUT_CONSENT_METADATA_KEY]: { locale: "ru" } })).toEqual({ locale: "ru" })
    expect(readConsentRecord({ [CHECKOUT_CONSENT_METADATA_KEY]: "yes" })).toBeNull()
    expect(readConsentRecord(null)).toBeNull()
  })
})
