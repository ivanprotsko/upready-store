import "server-only"
import { sdk } from "@lib/config"
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

/**
 * The Robokassa methods the owner switched off in the panel (t-2026-10-12-13), for the
 * footer's payment marks (t-2026-10-12-32; Ivan 13.10: «я просил в upready-store убрать в
 * магазине cherkashino.ru способ оплаты СБП, но он до сих пор там»). The answer is the one
 * the checkout reads fresh (`listRobokassaMethods`, `GET /store/tenant/robokassa-methods`);
 * the footer is on every page, so it takes it from the data cache for five minutes rather
 * than asking the backend on each render (the publishable key is in the request, so each
 * shop has its own entry). Ask only for a shop with Robokassa. A read that fails leaves
 * every mark where it was.
 */
export const getRobokassaDisabledMethods = async (): Promise<string[]> => {
  try {
    const { disabled } = await sdk.client.fetch<{ disabled?: unknown }>(
      "/store/tenant/robokassa-methods",
      { method: "GET", next: { revalidate: 300 }, cache: "force-cache" }
    )
    return Array.isArray(disabled)
      ? disabled.filter((alias): alias is string => typeof alias === "string")
      : []
  } catch {
    return []
  }
}
