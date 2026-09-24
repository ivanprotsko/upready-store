/**
 * Which payment methods THIS shop has connected (t-2026-09-24-n10): Robokassa
 * and the manual provider's two offline kinds. The backend resolves it once
 * (`api/storefront/by-host/route.ts` → `payment_methods`,
 * `tenant-secrets/payment-methods.ts`), the middleware carries it on
 * `x-tenant-payment-methods`, and every consumer here reads what arrives, the
 * same split `branding.ts` and `manual-payment.ts` use.
 *
 * `/store/payment-providers` already filters the checkout's own provider list
 * off this same fact — this copy is for the one thing that list alone cannot
 * say: whether `pp_system_default` is present as a real manual kind or only
 * as the last-resort demo card, which decides whether the checkout labels it
 * honestly as a test payment.
 */

export type TenantPaymentMethods = {
  robokassa: boolean
  manualCrypto: boolean
  manualManager: boolean
  /** Whether `pp_system_default`'s demo card is this shop's only way to pay. */
  demo: boolean
}

/** A shop that connected nothing (including no tenant at all, the single-store fallback): the demo card is all there is. */
export const EMPTY_TENANT_PAYMENT_METHODS: TenantPaymentMethods = {
  robokassa: false,
  manualCrypto: false,
  manualManager: false,
  demo: true,
}

/** From whatever the backend answered (or the header carried). A malformed document degrades to the empty default, never a throw inside the checkout. */
export const readTenantPaymentMethods = (raw: unknown): TenantPaymentMethods => {
  if (!raw || typeof raw !== "object") {
    return EMPTY_TENANT_PAYMENT_METHODS
  }

  const doc = raw as Partial<TenantPaymentMethods>

  return {
    robokassa: Boolean(doc.robokassa),
    manualCrypto: Boolean(doc.manualCrypto),
    manualManager: Boolean(doc.manualManager),
    demo: doc.demo !== undefined ? Boolean(doc.demo) : EMPTY_TENANT_PAYMENT_METHODS.demo,
  }
}

/** From the request header the middleware wrote. */
export const parseTenantPaymentMethodsHeader = (
  raw: string | null | undefined
): TenantPaymentMethods | null => {
  if (!raw) {
    return null
  }

  try {
    return readTenantPaymentMethods(JSON.parse(raw))
  } catch {
    return null
  }
}
