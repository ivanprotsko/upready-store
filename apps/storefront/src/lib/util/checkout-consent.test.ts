import { describe, expect, it } from "vitest"
import {
  CHECKOUT_CONSENT_METADATA_KEY,
  CHECKOUT_CONSENT_TEXT_VERSION,
  EMPTY_CONSENT,
  buildConsentRecord,
  readConsentRecord,
  restoreConsent,
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

describe("buildConsentRecord with a consent page", () => {
  it("stamps the consent document the checkbox links, not the policy", () => {
    const record = buildConsentRecord(
      { personalData: true, marketing: false },
      {
        hasTenant: true,
        pageKeys: ["offer", "privacy", "consent"],
        versions: { consent: "2026-10-04T07:00:00.000Z" },
      },
      "ru",
      now
    )

    expect(record.personal_data.document).toEqual({
      href: "/pages/consent",
      version: "2026-10-04T07:00:00.000Z",
    })
  })
})

describe("readConsentRecord", () => {
  it("reads the record back and ignores anything that is not one", () => {
    expect(readConsentRecord({ [CHECKOUT_CONSENT_METADATA_KEY]: { locale: "ru" } })).toEqual({ locale: "ru" })
    expect(readConsentRecord({ [CHECKOUT_CONSENT_METADATA_KEY]: "yes" })).toBeNull()
    expect(readConsentRecord(null)).toBeNull()
  })
})

describe("restoreConsent (t-2026-10-04-48)", () => {
  it("restores both boxes the buyer ticked on this cart, so a return from Robokassa reads as left", () => {
    const record = buildConsentRecord({ personalData: true, marketing: true }, legal, "ru", now)
    const metadata = { contact_first_name: "Иван", [CHECKOUT_CONSENT_METADATA_KEY]: record }

    expect(restoreConsent(readConsentRecord(metadata), legal)).toEqual({
      personalData: true,
      marketing: true,
    })
  })

  it("restores an unticked marketing box as unticked", () => {
    const record = buildConsentRecord({ personalData: true, marketing: false }, legal, "ru", now)

    expect(restoreConsent(record, legal)).toEqual({ personalData: true, marketing: false })
  })

  it("ticks nothing on a cart with no record (C5: never ticked in advance)", () => {
    expect(restoreConsent(readConsentRecord({ contact_first_name: "Иван" }), legal)).toEqual(
      EMPTY_CONSENT
    )
    expect(restoreConsent(null, legal)).toEqual(EMPTY_CONSENT)
  })

  it("ticks nothing when the wording has changed since the record was made", () => {
    const record = buildConsentRecord({ personalData: true, marketing: true }, legal, "ru", now)

    expect(restoreConsent({ ...record, text_version: "2026-01-01.1" }, legal)).toEqual(
      EMPTY_CONSENT
    )
  })

  it("asks for the personal-data consent again once the document it links has changed", () => {
    const record = buildConsentRecord({ personalData: true, marketing: true }, legal, "ru", now)
    const republished = {
      ...legal,
      versions: { ...legal.versions, privacy: "2026-10-05T00:00:00.000Z" },
    }

    expect(restoreConsent(record, republished)).toEqual({ personalData: false, marketing: true })
  })
})
