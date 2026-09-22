import "server-only"
import {
  EMPTY_MANUAL_PAYMENT,
  parseManualPaymentHeader,
  type TenantManualPayment,
} from "@lib/tenant/manual-payment"
import { decodeTenantHeaderValue } from "@lib/tenant/headers"
import { headers as nextHeaders } from "next/headers"

/**
 * The shop's offline ways to pay (olavka-payments): crypto wallets and manager
 * contacts, per tenant. Behind `import "server-only"` for the same reason
 * `getSiteBranding` is — `next/headers` throws in a client bundle, so the
 * checkout's client components take this as a prop from their server parent
 * (rule 19g).
 *
 * `EMPTY_MANUAL_PAYMENT` is the single-store fallback and the answer for a
 * shop whose owner enabled neither section: the middleware then writes no
 * header at all, and the checkout renders exactly as it did before this task.
 */
export const getTenantManualPayment = async (): Promise<TenantManualPayment> => {
  try {
    const headers = await nextHeaders()
    const parsed = parseManualPaymentHeader(
      decodeTenantHeaderValue(headers.get("x-tenant-manual-payment"))
    )

    if (parsed) {
      return parsed
    }
  } catch {
    // No request context or a header this process cannot parse — offer no
    // offline method rather than throw.
  }

  return EMPTY_MANUAL_PAYMENT
}
