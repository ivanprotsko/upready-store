import "server-only"
import {
  EMPTY_TENANT_PAYMENT_METHODS,
  parseTenantPaymentMethodsHeader,
  type TenantPaymentMethods,
} from "@lib/tenant/payment-methods"
import { decodeTenantHeaderValue } from "@lib/tenant/headers"
import { headers as nextHeaders } from "next/headers"

/**
 * Which payment methods this shop has connected (t-2026-09-24-n10). Behind
 * `import "server-only"` for the same reason `getSiteBranding` is —
 * `next/headers` throws in a client bundle, so a client component takes this
 * as a prop from a server parent (rule 19g).
 *
 * `EMPTY_TENANT_PAYMENT_METHODS` is the single-store fallback: a stand that
 * resolves no tenant gets no header, and its checkout renders the demo card
 * exactly as every deployment did before this shop connected anything.
 */
export const getSitePaymentMethods = async (): Promise<TenantPaymentMethods> => {
  try {
    const headers = await nextHeaders()
    const parsed = parseTenantPaymentMethodsHeader(
      decodeTenantHeaderValue(headers.get("x-tenant-payment-methods"))
    )

    if (parsed) {
      return parsed
    }
  } catch {
    // No request context or a header this process cannot parse — render as
    // the demo-only fallback rather than throw.
  }

  return EMPTY_TENANT_PAYMENT_METHODS
}
