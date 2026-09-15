import "server-only"
import { EMPTY_BRANDING, parseBrandingHeader, type TenantBranding } from "@lib/tenant/branding"
import { decodeTenantHeaderValue } from "@lib/tenant/headers"
import { headers as nextHeaders } from "next/headers"

/**
 * The tenant's brand identity (t16-owner-branding): logo, favicon, og image,
 * primary colour, footer credit. Behind `import "server-only"` for the same
 * reason `getSiteAttribution` is — `next/headers` throws in a client bundle,
 * so a client component takes this as a prop from a server parent (rule 19g).
 *
 * `EMPTY_BRANDING` is the single-store fallback: a stand that resolves no
 * tenant gets no header, and every consumer already renders exactly as it did
 * before this task with an empty branding document.
 */
export const getSiteBranding = async (): Promise<TenantBranding> => {
  try {
    const headers = await nextHeaders()
    const parsed = parseBrandingHeader(
      decodeTenantHeaderValue(headers.get("x-tenant-branding"))
    )

    if (parsed) {
      return parsed
    }
  } catch {
    // No request context or a header this process cannot parse — render with
    // no branding rather than throw.
  }

  return EMPTY_BRANDING
}
