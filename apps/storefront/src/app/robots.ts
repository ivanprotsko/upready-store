import { MetadataRoute } from "next"
import { getRequestBaseURL } from "@lib/data/cookies"

// Per request, not per build: one process answers for every shop by Host, and
// `sitemap`/`host` have to name the shop that was asked (`lib/tenant/origin.ts`).
export default async function robots(): Promise<MetadataRoute.Robots> {
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
