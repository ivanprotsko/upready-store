import { readFile } from "node:fs/promises"
import path from "node:path"
import { getSiteBranding } from "@lib/data/tenant-branding"

export const alt =
  "Production-ready Medusa DTC Starter: Medusa, Gorgo and Next.js logos next to a screenshot of the Clothing category page in the Gorgo Medusa Store storefront"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

/** Same tenant-branding override as `opengraph-image.tsx`, kept as its own
 * route because Twitter/X reads `twitter:image` from this file's own
 * convention name rather than falling back to `og:image`. */
export default async function Image() {
  const branding = await getSiteBranding()

  if (branding.og_image_url) {
    return Response.redirect(branding.og_image_url, 307)
  }

  const file = await readFile(path.join(process.cwd(), "public/og/twitter-image-default.png"))
  return new Response(new Uint8Array(file), { headers: { "Content-Type": contentType } })
}
