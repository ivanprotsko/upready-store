import "server-only"
import { parseTenantPromoCodeHeader } from "@lib/tenant/promo-code"
import { decodeTenantHeaderValue } from "@lib/tenant/headers"
import { headers as nextHeaders } from "next/headers"

/**
 * Whether this shop's cart and checkout show the promo code field (t-2026-10-13-11), from the
 * header `src/middleware.ts` set. A stand that resolves no tenant gets no header and keeps the
 * field, as every shop did before the switch.
 */
export const getSitePromoCodeEnabled = async (): Promise<boolean> => {
  try {
    const headers = await nextHeaders()
    return parseTenantPromoCodeHeader(decodeTenantHeaderValue(headers.get("x-tenant-promo-code")))
  } catch {
    // No request context: keep the field rather than throw.
    return true
  }
}
