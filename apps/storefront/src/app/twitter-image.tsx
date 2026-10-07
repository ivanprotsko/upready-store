import { readFile } from "node:fs/promises"
import path from "node:path"
import { getSiteName, getTenantHandle } from "@lib/data/cookies"
import { getSiteBranding } from "@lib/data/tenant-branding"
import { socialImageSource } from "@lib/tenant/social-card"
import { renderSocialCard } from "@lib/tenant/social-card-image"

// The `alt` of a host with no shop behind it. A shop's own `alt` is its name,
// set from `app/[locale]/layout.tsx` (`buildSocialImageMetadata`).
export const alt =
  "Production-ready Medusa DTC Starter: Medusa, Gorgo and Next.js logos next to a screenshot of the Clothing category page in the Gorgo Medusa Store storefront"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

/** Same tenant-branding override and the same shop card as `opengraph-image.tsx`,
 * kept as its own route because Twitter/X reads `twitter:image` from this file's
 * own convention name rather than falling back to `og:image`. */
export default async function Image() {
  const [branding, handle, shopName] = await Promise.all([
    getSiteBranding(),
    getTenantHandle(),
    getSiteName(),
  ])
  const source = socialImageSource({ hasTenant: Boolean(handle), ogImageUrl: branding.og_image_url })

  if (source === "own" && branding.og_image_url) {
    return Response.redirect(branding.og_image_url, 307)
  }

  if (source === "card") {
    return renderSocialCard({ shopName, branding })
  }

  const file = await readFile(path.join(process.cwd(), "public/og/twitter-image-default.png"))
  return new Response(new Uint8Array(file), { headers: { "Content-Type": contentType } })
}
