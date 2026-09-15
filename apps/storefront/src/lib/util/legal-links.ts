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
  | "privacy"
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
  terms: { keys: ["offer", "terms", "legal"], starter: "/terms" },
  privacy: { keys: ["privacy"], starter: "/privacy" },
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
  { hasTenant, pageKeys }: LegalLinkContext
): string | null {
  if (!hasTenant) {
    return LEGAL_SLOTS[slot].starter
  }

  const key = LEGAL_SLOTS[slot].keys.find((candidate) =>
    pageKeys.includes(candidate)
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
