import type { MetadataRoute } from "next"
import { defaultLocale } from "@i18n/config"
import { getSiteBranding } from "@lib/data/tenant-branding"
import { getEnabledLocales, getSiteName, getTenantDefaultLocale } from "@lib/data/cookies"
import { buildManifest } from "@lib/tenant/manifest"

/**
 * `/manifest.webmanifest`, per request rather than per build (t-2026-10-03-61): one process
 * answers for every shop by Host, the reason `robots.ts`/`sitemap.ts` read the request too. The
 * file convention itself links it from every page. `x-tenant-default-locale` is only sent for a
 * shop that saved its languages (`getEnabledLocales` answers non-null then); any other host
 * starts on the build's default locale, the one the middleware would pick.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [branding, shopName, enabledLocales, tenantLocale] = await Promise.all([
    getSiteBranding(),
    getSiteName(),
    getEnabledLocales(),
    getTenantDefaultLocale(),
  ])

  return buildManifest({ branding, shopName, locale: enabledLocales ? tenantLocale : defaultLocale })
}
