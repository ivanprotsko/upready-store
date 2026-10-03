"use server"

import { headers as nextHeaders } from "next/headers"
import { fetchWithoutLocale } from "@lib/config"
import { originForHost } from "@lib/tenant/origin"
import type { SisterSite } from "@lib/util/alternates-core"

type SisterSiteResponse = {
  domain: string
  locale: string
}

/**
 * The sites of this shop's own client (t-cherk-31, `GET /store/tenant/sites`):
 * domain and locale of each sister, nothing private. Not locale-scoped —
 * `fetchWithoutLocale`, the way `llms.txt` and `sitemap.ts` read data that does
 * not vary by visitor language, or whichever language filled the cache first
 * would be served to every visitor. A host with no tenant, or a tenant with no
 * sisters, resolves to an empty list, same as today.
 *
 * The backend answers with bare hosts (`tenant_domain.host` has no scheme), so
 * the scheme and port are rebuilt from THIS request, through `originForHost`:
 * on a stand every tenant answers on the same port, so the current request's
 * own port is also the sister's.
 */
export async function getHreflangSisters(): Promise<SisterSite[]> {
  try {
    const { sites } = await fetchWithoutLocale<{ sites: SisterSiteResponse[] }>(
      "/store/tenant/sites",
      {
        next: { tags: ["hreflang-sisters"] },
        cache: "force-cache",
      }
    )

    if (!sites.length) {
      return []
    }

    const requestHeaders = await nextHeaders()

    return sites.map((site) => ({
      origin: originForHost(requestHeaders, "", site.domain),
      locale: site.locale,
    }))
  } catch {
    return []
  }
}
