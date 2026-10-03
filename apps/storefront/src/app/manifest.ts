import type { MetadataRoute } from "next"
import { getSiteBranding } from "@lib/data/tenant-branding"
import { getSiteName, getTenantDefaultLocale } from "@lib/data/cookies"
import { buildManifest } from "@lib/tenant/manifest"

/**
 * `/manifest.webmanifest`, per request rather than per build (t-2026-10-03-61): one process
 * answers for every shop by Host, the same reason `robots.ts`/`sitemap.ts` read the request
 * instead of a build-time constant. `app/layout.tsx` links to this path unconditionally; a tenant
 * with no icon set still gets a usable manifest (`buildManifest`'s own static-icon.svg fallback).
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [branding, shopName, defaultLocale] = await Promise.all([
    getSiteBranding(),
    getSiteName(),
    getTenantDefaultLocale(),
  ])

  return buildManifest({ branding, shopName, defaultLocale })
}
