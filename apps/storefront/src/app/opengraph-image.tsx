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

/**
 * t16-owner-branding, step 3: a tenant's own og image (set through the panel)
 * redirects a scraper straight to its own file. A single-store stand with no
 * tenant at all falls through to the build's static default,
 * `public/og/opengraph-image-default.png`, unchanged from before this task
 * (moved out of the special `opengraph-image.png` file-name convention, which
 * a static file always wins over a dynamic sibling of the same name).
 *
 * t-2026-10-08-13: a tenant with no image of its own gets a card with its own
 * name, not the build's default, which advertises the starter.
 */
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

  const file = await readFile(path.join(process.cwd(), "public/og/opengraph-image-default.png"))
  return new Response(new Uint8Array(file), { headers: { "Content-Type": contentType } })
}
