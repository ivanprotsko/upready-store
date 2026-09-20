import { readFile } from "node:fs/promises"
import path from "node:path"
import { getSiteBranding } from "@lib/data/tenant-branding"

export const alt =
  "Production-ready Medusa DTC Starter: Medusa, Gorgo and Next.js logos next to a screenshot of the Clothing category page in the Gorgo Medusa Store storefront"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

/**
 * t16-owner-branding, step 3: a tenant's own og image (set through the panel)
 * redirects a scraper straight to its own file; a tenant with none — or a
 * single-store stand with no tenant at all — falls through to the build's
 * static default, `public/og/opengraph-image-default.png`, unchanged from
 * before this task (moved out of the special `opengraph-image.png` file-name
 * convention, which a static file always wins over a dynamic sibling of the
 * same name).
 */
export default async function Image() {
  const branding = await getSiteBranding()

  if (branding.og_image_url) {
    return Response.redirect(branding.og_image_url, 307)
  }

  const file = await readFile(path.join(process.cwd(), "public/og/opengraph-image-default.png"))
  return new Response(new Uint8Array(file), { headers: { "Content-Type": contentType } })
}
