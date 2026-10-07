import { legalHref, type LegalLinkContext } from "./legal-links"

/**
 * The block under the account pages: one line of text and one link
 * (t-2026-10-08-13). The starter's own copy promises answers to frequent
 * questions and names the link "customer service"; on a shop that link opened
 * the contacts page, where there are no such answers. A shop now says what is
 * true: ask through the shop's contacts, and the link is named "contacts".
 *
 * A shop's link goes to its contacts page first, so the name on it is the page
 * it opens; a shop that has a support page and no contacts page keeps that one.
 * A host with no shop keeps the starter's text, name and page.
 *
 * `text` and `label` are keys of the `AccountLayout` namespace.
 */
export type AccountSupport = {
  text: "shopQuestions" | "faqDescription"
  label: "contacts" | "customerService"
  href: string | null
}

export const accountSupport = (legal: LegalLinkContext): AccountSupport => {
  if (!legal.hasTenant) {
    return { text: "faqDescription", label: "customerService", href: legalHref("support", legal) }
  }

  return {
    text: "shopQuestions",
    label: "contacts",
    href: legalHref("contact", legal) ?? legalHref("support", legal),
  }
}
