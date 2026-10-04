import "server-only"
import {
  EMPTY_TENANT_TEST_MODE,
  parseTenantTestModeHeader,
  type TenantTestMode,
} from "@lib/tenant/test-mode"
import { decodeTenantHeaderValue } from "@lib/tenant/headers"
import { headers as nextHeaders } from "next/headers"

/**
 * Whether this shop's payments or delivery are in test mode (t-2026-10-04-21), from the header
 * `src/middleware.ts` set. Behind `import "server-only"` like `getSitePaymentMethods`. A stand
 * that resolves no tenant gets no header and no dot.
 */
export const getSiteTestMode = async (): Promise<TenantTestMode> => {
  try {
    const headers = await nextHeaders()
    const parsed = parseTenantTestModeHeader(decodeTenantHeaderValue(headers.get("x-tenant-test-mode")))

    if (parsed) {
      return parsed
    }
  } catch {
    // No request context or a header this process cannot parse — no dot rather than a throw.
  }

  return EMPTY_TENANT_TEST_MODE
}
