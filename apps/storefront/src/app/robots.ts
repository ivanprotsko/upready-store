import { MetadataRoute } from "next"
import { getRequestBaseURL } from "@lib/data/cookies"
import { isStageSite } from "@lib/data/tenant-stage"

// Per request, not per build: one process answers for every shop by Host, and
// `sitemap`/`host` have to name the shop that was asked (`lib/tenant/origin.ts`).
//
// A stage site (t-2026-10-27-04) is closed whole: no sitemap, nothing allowed.
export default async function robots(): Promise<MetadataRoute.Robots> {
  if (await isStageSite()) {
    return { rules: [{ userAgent: "*", disallow: "/" }] }
  }

  const base = await getRequestBaseURL()

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/*/account",
          "/*/checkout",
          "/*/cart",
          "/*/order/",
          "/*/reset-password",
          "/api/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
