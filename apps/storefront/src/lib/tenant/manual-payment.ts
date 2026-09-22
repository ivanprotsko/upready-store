/**
 * The shop's offline ways to pay on the built-in `pp_system_default` provider
 * (olavka-payments): a crypto transfer to the owner's wallets and «card via
 * manager», settled by messenger. The backend publishes them per shop
 * (`api/storefront/by-host/route.ts` → `manual_payment`, written by
 * `PUT /tenants/payment-settings/manual`), the middleware carries them on
 * `x-tenant-manual-payment`, and the checkout and the confirmation page read
 * what arrives — the same split `branding.ts` and `attribution.ts` use.
 *
 * Nothing here is a default. A wallet address or a phone number appears on a
 * page only because the OWNER of that shop typed it into the panel; a section
 * the owner has not enabled is a method the checkout does not offer, and a shop
 * that configured neither looks exactly as it did before this file existed.
 */

export type ManualPaymentWallet = {
  /** The chain, as the buyer needs to see it next to the address: "TRC-20", "ERC-20". */
  network: string
  /** The asset: "USDT", "USDC". */
  currency: string
  address: string
}

export type ManualPaymentContacts = {
  /** Digits with an optional leading `+`, what `https://wa.me/<number>` takes. */
  whatsapp: string | null
  /** The username without the `@`, what `https://t.me/<username>` takes. */
  telegram: string | null
  email: string | null
  /** The owner's own line under the method, e.g. which transfers they accept. */
  note: string | null
}

export type TenantManualPayment = {
  crypto: { enabled: boolean; wallets: ManualPaymentWallet[] }
  manager: { enabled: boolean } & ManualPaymentContacts
}

/** The buyer's choice inside the manual provider, stamped on the cart and so on the order. */
export type ManualPaymentKind = "crypto" | "other"

/** Where the checkout writes the chosen kind: `cart.metadata`, copied onto `order.metadata` at completion. */
export const MANUAL_PAYMENT_KIND_METADATA_KEY = "manual_payment_kind"

/** A shop that configured nothing: the checkout then renders exactly as it does today. */
export const EMPTY_MANUAL_PAYMENT: TenantManualPayment = {
  crypto: { enabled: false, wallets: [] },
  manager: { enabled: false, whatsapp: null, telegram: null, email: null, note: null },
}

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null

const readWallets = (raw: unknown): ManualPaymentWallet[] => {
  if (!Array.isArray(raw)) {
    return []
  }

  const wallets: ManualPaymentWallet[] = []

  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue
    }
    const wallet = item as Partial<ManualPaymentWallet>
    const network = str(wallet.network)
    const currency = str(wallet.currency)
    const address = str(wallet.address)
    if (network && currency && address) {
      wallets.push({ network, currency, address })
    }
  }

  return wallets
}

/**
 * From whatever the backend answered (or the header carried). A crypto section
 * with no wallet is off, and a section that is off carries nothing, so a
 * malformed or half-filled document degrades to «not offered», never to a
 * throw inside the checkout.
 */
export const readManualPayment = (raw: unknown): TenantManualPayment => {
  if (!raw || typeof raw !== "object") {
    return EMPTY_MANUAL_PAYMENT
  }

  const doc = raw as {
    crypto?: { enabled?: unknown; wallets?: unknown } | null
    manager?: Partial<Record<keyof ManualPaymentContacts | "enabled", unknown>> | null
  }
  const wallets = doc.crypto?.enabled ? readWallets(doc.crypto.wallets) : []
  const manager = doc.manager && typeof doc.manager === "object" ? doc.manager : null

  return {
    crypto: { enabled: wallets.length > 0, wallets },
    manager: manager?.enabled
      ? {
          enabled: true,
          whatsapp: str(manager.whatsapp),
          telegram: str(manager.telegram),
          email: str(manager.email),
          note: str(manager.note),
        }
      : EMPTY_MANUAL_PAYMENT.manager,
  }
}

/** The kinds the checkout may offer inside the manual provider, in display order. */
export const availableManualPaymentKinds = (
  manual: TenantManualPayment
): ManualPaymentKind[] => {
  const kinds: ManualPaymentKind[] = []
  if (manual.crypto.enabled && manual.crypto.wallets.length > 0) {
    kinds.push("crypto")
  }
  if (manual.manager.enabled) {
    kinds.push("other")
  }
  return kinds
}

/** From the request header the middleware wrote. Malformed JSON is not a 500 — the
 * shop still renders with no offline method, the posture `parseBrandingHeader` takes. */
export const parseManualPaymentHeader = (
  raw: string | null | undefined
): TenantManualPayment | null => {
  if (!raw) {
    return null
  }

  try {
    return readManualPayment(JSON.parse(raw))
  } catch {
    return null
  }
}

/** The kind an order was placed with, or null for a manual order that predates the split (the demo card). */
export const readManualPaymentKind = (
  metadata: Record<string, unknown> | null | undefined
): ManualPaymentKind | null => {
  const value = metadata?.[MANUAL_PAYMENT_KIND_METADATA_KEY]
  return value === "crypto" || value === "other" ? value : null
}
