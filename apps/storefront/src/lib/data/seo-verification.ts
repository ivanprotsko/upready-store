import "server-only"
import { decodeTenantHeaderValue } from "@lib/tenant/headers"
import { headers as nextHeaders } from "next/headers"

export type SeoVerification = { yandex: string | null; google: string | null }

/**
 * The search-console ownership tags of this shop (t11-seo-redirects step 6),
 * carried by the middleware on `x-tenant-seo-verification` the same way the
 * footer's attribution line travels (`lib/data/attribution.ts`). Null when the
 * owner has set neither, or on a single-store stand with no tenant header.
 */
export const getSeoVerification = async (): Promise<SeoVerification | null> => {
  try {
    const headers = await nextHeaders()
    const raw = decodeTenantHeaderValue(headers.get("x-tenant-seo-verification"))

    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Partial<SeoVerification>
    return { yandex: parsed.yandex ?? null, google: parsed.google ?? null }
  } catch {
    return null
  }
}
