import "server-only"
import {
  EMPTY_PAYMENT_PRE_NOTICE,
  parsePaymentPreNoticeHeader,
  type TenantPaymentPreNotice,
} from "@lib/util/payment-pre-notice"
import { decodeTenantHeaderValue } from "@lib/tenant/headers"
import { headers as nextHeaders } from "next/headers"

/**
 * The pre-payment notice's per-method fields (rule 5zd, t-2026-10-03-32).
 * Behind `import "server-only"` for the same reason `getTenantManualPayment`
 * is — `next/headers` throws in a client bundle, so the checkout's client
 * components take this as a prop from their server parent (rule 19g).
 *
 * `EMPTY_PAYMENT_PRE_NOTICE` is the single-store fallback: a stand that
 * resolves no tenant gets no header, and its checkout shows no notice for
 * any method, exactly as every deployment did before this task.
 */
export const getTenantPaymentPreNotice = async (): Promise<TenantPaymentPreNotice> => {
  try {
    const headers = await nextHeaders()
    const parsed = parsePaymentPreNoticeHeader(
      decodeTenantHeaderValue(headers.get("x-tenant-payment-pre-notice"))
    )

    if (parsed) {
      return parsed
    }
  } catch {
    // No request context or a header this process cannot parse — show no
    // notice rather than throw.
  }

  return EMPTY_PAYMENT_PRE_NOTICE
}
