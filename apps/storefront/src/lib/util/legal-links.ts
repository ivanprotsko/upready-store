/**
 * Where a legal link points. One mapping for the whole storefront, because the
 * same four documents are named in the checkout consent sentence, in the
 * signup consent sentence, in the checkout footer, in the account screens and
 * in the order help strip, and before f05-checkout-legal-stubs each of those
 * call sites wrote its own `/terms` by hand.
 *
 * The starter ships a placeholder page per slot (`/terms`, `/privacy`,
 * `/returns`, `/shipping`, `/customer-service`, `/contact`, all rendered by
 * `@modules/common/components/content-page`, all carrying "This page ships
 * with the starter as placeholder text"). A tenant writes its own documents as
 * content pages instead (`/pages/<key>`, t05-page-keys), and those are the
 * pages a buyer must be shown: measured on cherkashino.shipshift.dev
 * 2026-09-15, the shop had a 19 000-character public offer under
 * `/ru/pages/offer` while the checkout asked the buyer to accept `/ru/terms`,
 * which answered "Это страница-заглушка из стартера".
 *
 * Pure on purpose: no `next/headers`, no fetch, so a client component may
 * import it (rule 19g) and a unit test may cover the mapping without a stand.
 * The shop's side of the decision (does this deployment have a tenant, which
 * pages has it published) is read once per request by
 * `@lib/data/legal-links` and handed here as `LegalLinkContext`.
 */

export type LegalSlot =
  | "terms"
  | "termsOfUse"
  | "privacy"
  | "consent"
  | "returns"
  | "shipping"
  | "support"
  | "contact"

type SlotSpec = {
  /**
   * Tenant page keys that cover this slot, most specific first. `offer` leads
   * the terms slot because a Russian shop's contract with the buyer is the
   * публичная оферта, and `TENANT_PAGE_KEYS` reserves that key for it.
   */
  keys: readonly string[]
  /** The starter placeholder route, kept for a deployment with no tenant. */
  starter: string
}

export const LEGAL_SLOTS: Record<LegalSlot, SlotSpec> = {
  // The contract itself. `legal` used to close this list, but that key is the
  // panel's "Реквизиты" section (`TENANT_PAGE_KEYS` in the backend model), so
  // a shop that writes its requisites and no contract would have sent a buyer
  // reading "вы принимаете условия" to a table of registration numbers
  // (b14-pages-legal-content). No shop on the platform had a `legal` page when
  // it went, so nothing that resolved before resolves differently now.
  terms: { keys: ["offer", "terms"], starter: "/terms" },
  // Website usage terms, a document of its own: the checkout sentence names
  // "условия" and "условия использования" separately, and before this slot
  // existed both chunks were resolved through `terms` and underlined the same
  // `/pages/offer` twice in one sentence. A shop that has not written one
  // still falls back to the contract through `consentHref`, which is the old
  // behaviour.
  termsOfUse: { keys: ["terms", "terms-of-use"], starter: "/terms" },
  privacy: { keys: ["privacy"], starter: "/privacy" },
  // The personal-data consent itself (152-ФЗ ст. 9), a document of its own and not the
  // policy (n5 consent verdict; t-2026-10-04-22). No starter page: a deployment with no
  // tenant links the policy instead, which is what the checkbox did before.
  consent: { keys: ["consent"], starter: "/privacy" },
  returns: { keys: ["returns", "return-policy", "refund"], starter: "/returns" },
  shipping: { keys: ["shipping", "delivery"], starter: "/shipping" },
  support: {
    keys: ["support", "customer-service", "faq", "contacts"],
    starter: "/customer-service",
  },
  contact: { keys: ["contacts", "contact"], starter: "/contact" },
}

export type LegalLinkContext = {
  /**
   * False for a single-store deployment, where the starter's own pages are the
   * only pages there are and the placeholder copy is the shop owner's to
   * replace (`README.md`, "Replace it with your own before you go live").
   */
  hasTenant: boolean
  /** Every page key this tenant has PUBLISHED, footer-linked or not. */
  pageKeys: readonly string[]
  /**
   * Page key → its latest `updated_at` across locales: the version of the document a
   * checkout consent points to, stamped on the order (`@lib/util/checkout-consent`).
   * Absent where nobody needs it.
   */
  versions?: Readonly<Record<string, string>>
}

/** A deployment with no tenant: every slot keeps its starter page. */
export const NO_TENANT: LegalLinkContext = { hasTenant: false, pageKeys: [] }

/**
 * Where a NAVIGATION link goes: the tenant's own page, or nowhere.
 *
 * `null` means "do not render this link". A navigation link promises a page
 * with something on it, and a shop that has not written its shipping terms is
 * better represented by no link at all than by a link to a page that tells the
 * buyer the shop is still a template.
 */
export function legalHref(
  slot: LegalSlot,
  context: LegalLinkContext
): string | null {
  const { hasTenant, pageKeys } = context

  if (!hasTenant) {
    return LEGAL_SLOTS[slot].starter
  }

  // A-23 (46df audit): `termsOfUse.keys` carries `"terms"` as its own fallback
  // — a shop with no dedicated usage-terms page still answers through the
  // contract — but resolving it HERE, via the exact key the `terms` slot
  // itself would claim, meant a shop whose only page is literally named
  // `terms` (not `offer`) got BOTH slots pointing at `/pages/terms` directly,
  // rather than through `consentHref`'s own explicit, documented fallback
  // below. Exclude whatever key `terms` itself already resolved to (a KEY,
  // not a blanket `"terms"` — `terms` resolving through `offer` instead still
  // leaves the literal `terms` page free for this slot, `OKSANA_AFTER` in
  // `legal-links.test.ts`), and let the explicit fallback carry the shop that
  // still has none.
  const claimedByTerms =
    slot === "termsOfUse" ? legalHref("terms", context) : null
  const claimedKey = claimedByTerms?.replace(/^\/pages\//, "") ?? null

  const key = LEGAL_SLOTS[slot].keys.find(
    (candidate) => pageKeys.includes(candidate) && candidate !== claimedKey
  )

  return key ? `/pages/${key}` : null
}

/**
 * Where a CONSENT link goes: the sentence under the "Pay" button and under the
 * signup button, where the buyer is told which documents they are accepting.
 *
 * Same resolution as a navigation link, plus one fallback: a slot the tenant
 * has no page for falls back to the terms slot, the contract itself. A Russian
 * публичная оферта carries the return and delivery terms as its own sections,
 * so the offer is where a buyer sent looking for the return policy actually
 * finds it, and a buyer told they accept a document is entitled to read
 * something. `null` (the tenant has published no legal page at all) renders the
 * words as plain text: no link beats a link to a placeholder that says the shop
 * has no contract.
 */
export function consentHref(
  slot: LegalSlot,
  context: LegalLinkContext
): string | null {
  return legalHref(slot, context) ?? legalHref("terms", context)
}

/**
 * Where the mandatory personal-data checkbox links: the shop's consent document
 * (`/pages/consent`), and the privacy policy for a shop that has not published one.
 * The policy is a document the buyer only reads; what they consent to is its own text.
 */
export function personalDataConsentHref(context: LegalLinkContext): string | null {
  return legalHref("consent", context) ?? consentHref("privacy", context)
}

/**
 * For the starter placeholder routes themselves (`/terms` and its five
 * siblings): what a request for one should get.
 *
 * `render` keeps the placeholder, and only a deployment with no tenant gets it.
 * A tenant's visitor is redirected to the shop's own document, or gets a 404
 * when the shop has none: a page whose whole text is "Это страница-заглушка из
 * стартера" is not something a shop should serve under its own domain, and it
 * reached buyers through more than the links this task fixed (the sitemap
 * listed all six, and an old index entry or a bookmark needs no link at all).
 */
export type StarterPageVerdict =
  | { kind: "render" }
  | { kind: "redirect"; to: string }
  | { kind: "gone" }

export function starterPageVerdict(
  slot: LegalSlot,
  context: LegalLinkContext
): StarterPageVerdict {
  if (!context.hasTenant) {
    return { kind: "render" }
  }

  const href = legalHref(slot, context)

  return href ? { kind: "redirect", to: href } : { kind: "gone" }
}

/** The documents every footer links to (audit 2026-09-23, B-01, 152-ФЗ). */
export const FOOTER_LEGAL_SLOTS = ["terms", "privacy"] as const satisfies readonly LegalSlot[]

export type FooterLegalLink = { slot: LegalSlot; href: string; label: string }

/**
 * The legal row under every footer variant: the shop's offer and privacy policy.
 *
 * Only a tenant's own PUBLISHED pages are linked. A deployment with no tenant,
 * or a tenant that has published neither, gets an empty list and the row is not
 * rendered: a starter placeholder is not a document a buyer can rely on, and a
 * dead link is worse than none.
 *
 * The label is the page's own title when the footer page list carries it
 * (`titles`, keyed by page key), otherwise the slot's generic title
 * (`fallbackLabels`, from the existing `Metadata.<slot>.title` messages).
 */
export function footerLegalLinks(
  context: LegalLinkContext,
  titles: Readonly<Record<string, string>>,
  fallbackLabels: Readonly<Record<(typeof FOOTER_LEGAL_SLOTS)[number], string>>
): FooterLegalLink[] {
  if (!context.hasTenant) {
    return []
  }

  return FOOTER_LEGAL_SLOTS.flatMap((slot) => {
    const href = legalHref(slot, context)

    if (!href) {
      return []
    }

    const key = href.replace(/^\/pages\//, "")

    return [{ slot, href, label: titles[key] || fallbackLabels[slot] }]
  })
}
