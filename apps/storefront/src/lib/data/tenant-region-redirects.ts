import "server-only"
import { decodeTenantHeaderValue } from "@lib/tenant/headers"
import {
  parseRegionRedirectsHeader,
  type RegionRedirect,
} from "@lib/tenant/region-redirects"
import { headers as nextHeaders } from "next/headers"

/**
 * The countries this shop sends to another shop (t-2026-10-20-22), from the header
 * `src/middleware.ts` set. A stand that resolves no tenant, or a shop without the
 * setting, gets none, and with none there is no region popup.
 */
export const getTenantRegionRedirects = async (): Promise<RegionRedirect[]> => {
  try {
    const headers = await nextHeaders()
    return parseRegionRedirectsHeader(
      decodeTenantHeaderValue(headers.get("x-tenant-region-redirects"))
    )
  } catch {
    // No request context: no popup rather than a throw.
    return []
  }
}
