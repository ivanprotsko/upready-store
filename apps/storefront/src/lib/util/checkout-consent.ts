import { consentHref, type LegalLinkContext, type LegalSlot } from "@lib/util/legal-links"

/** `cart.metadata` key; Medusa copies cart metadata onto the order at completion. */
export const CHECKOUT_CONSENT_METADATA_KEY = "checkout_consent"

/** Bumped whenever the consent wording in `messages/*.json` (`CheckoutConsent`, `CheckoutPage.legal`) changes. */
export const CHECKOUT_CONSENT_TEXT_VERSION = "2026-10-04"

export type CheckoutConsentValue = {
  personalData: boolean
  marketing: boolean
}

export const EMPTY_CONSENT: CheckoutConsentValue = { personalData: false, marketing: false }

type ConsentDocument = { href: string | null; version: string | null }

export type CheckoutConsentRecord = {
  text_version: string
  locale: string
  personal_data: { given: boolean; at: string | null; document: ConsentDocument }
  marketing: { given: boolean; at: string | null }
  /** Accepted by pressing the button (`CheckoutPage.legal`); stamped with the documents as they stood. */
  offer: { document: ConsentDocument }
}

const documentOf = (slot: LegalSlot, legal: LegalLinkContext): ConsentDocument => {
  const href = consentHref(slot, legal)
  const key = href?.startsWith("/pages/") ? href.slice("/pages/".length) : null

  return { href, version: (key && legal.versions?.[key]) || null }
}

/**
 * The proof of consent the order carries (rule C3 of the 04.10 checklist: who, when, which
 * version of the document). Who is the order's own customer and e-mail; this adds when each
 * box was ticked, the wording version and the version (`updated_at`) of the shop's page each
 * consent points to. `previous` keeps the first tick time while a box stays ticked.
 */
export const buildConsentRecord = (
  value: CheckoutConsentValue,
  legal: LegalLinkContext,
  locale: string,
  now: Date,
  previous?: Partial<CheckoutConsentRecord> | null
): CheckoutConsentRecord => {
  const stamp = (given: boolean, before: string | null | undefined) =>
    given ? before ?? now.toISOString() : null

  return {
    text_version: CHECKOUT_CONSENT_TEXT_VERSION,
    locale,
    personal_data: {
      given: value.personalData,
      at: stamp(value.personalData, previous?.personal_data?.at),
      document: documentOf("privacy", legal),
    },
    marketing: {
      given: value.marketing,
      at: stamp(value.marketing, previous?.marketing?.at),
    },
    offer: { document: documentOf("terms", legal) },
  }
}

/** Reads the record back from `cart.metadata`, or null when there is none. */
export const readConsentRecord = (
  metadata: Record<string, unknown> | null | undefined
): Partial<CheckoutConsentRecord> | null => {
  const value = metadata?.[CHECKOUT_CONSENT_METADATA_KEY]

  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Partial<CheckoutConsentRecord>)
    : null
}
