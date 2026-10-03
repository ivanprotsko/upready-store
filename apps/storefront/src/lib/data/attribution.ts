import "server-only"
import {
  ATTRIBUTION_FALLBACK,
  attributionFromHeader,
  type TenantAttribution,
} from "@lib/tenant/attribution"
import { decodeTenantHeaderValue } from "@lib/tenant/headers"
import { headers as nextHeaders } from "next/headers"

export { ATTRIBUTION_FALLBACK }

/**
 * The footer's attribution line: «создание интернет-магазина — upready», where
 * the anchor is a link to us (`t-2026-09-12-footer-attribution`).
 *
 * The value is DATA, not markup: the backend resolves it per shop — the shop's
 * own override, then its group, then the platform default — and the middleware
 * puts it on `x-tenant-attribution` (`api/storefront/by-host/attribution.ts`).
 * That is what makes point 2.1 of the order work: different shops carry different
 * anchors without a single edit to this template.
 *
 * The constant below is the SINGLE-STORE fallback only — a stand that resolves no
 * tenant and therefore gets no header. It mirrors `ATTRIBUTION_FALLBACK` in the
 * backend on purpose; the two are the same line for two deployments that cannot
 * see each other.
 *
 * Behind `import "server-only"` because `next/headers` throws in a client bundle:
 * a client component takes the resolved line as a prop from a server parent
 * (rule 19g).
 */
export const getSiteAttribution = async (): Promise<TenantAttribution | null> => {
  try {
    const headers = await nextHeaders()

    // Null for a shop switched off with `attribution_hidden`: its footer shows no
    // credit at all, not even ours (Ivan 04.10.2026).
    return attributionFromHeader(
      decodeTenantHeaderValue(headers.get("x-tenant-attribution"))
    )
  } catch {
    // No request context, no tenant, or a header this process cannot parse. The
    // footer still has to render, and the platform's own line is the right
    // answer for all three.
  }

  return ATTRIBUTION_FALLBACK
}
