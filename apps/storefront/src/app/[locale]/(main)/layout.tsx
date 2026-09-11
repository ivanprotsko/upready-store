import type { Metadata } from "next"
import { Suspense } from "react"

import {
  getPromoBannerDismissed,
  getRequestBaseURL,
  getTenantHandle,
} from "@lib/data/cookies"
import { getEffectiveSettings } from "@lib/data/tenant-home"
import { DEFAULT_HEADER } from "@modules/layout/templates/nav/variants"
import BottomNav from "@modules/layout/components/bottom-nav"
import CartNotifications from "@modules/layout/components/cart-notifications"
import PromoBanner from "@modules/layout/components/promo-banner"
import Footer from "@modules/layout/templates/footer"
import Nav from "@modules/layout/templates/nav"

// Per request, same reason as the root layout: see `lib/tenant/origin.ts`.
export async function generateMetadata(): Promise<Metadata> {
  return { metadataBase: new URL(await getRequestBaseURL()) }
}

export default async function PageLayout(props: { children: React.ReactNode }) {
  // The promo-banner cookie is a cookie lookup, not a fetch. The settings read
  // shares its cache tag with `Nav`'s own read below (`storefront-settings`,
  // Next's fetch request memoization) so this costs no second round trip.
  const [promoBannerDismissed, settings, tenantHandle] = await Promise.all([
    getPromoBannerDismissed(),
    getEffectiveSettings(),
    getTenantHandle(),
  ])
  // Two reasons the site-wide strip does not render.
  //
  // H3's service tier already carries the same promo text (`nav/variants/h3.tsx`'s own
  // doc comment) — showing the site-wide strip too would double it.
  //
  // And a shop on the SHARED ENGINE has no promo of its own: `promoText()` reads the
  // profile baked into the image, so every tenant was making the sneakers profile's
  // promise — "Free shipping over $120 · 30-day returns · every pair ships in 48 hours",
  // measured on globex.shipshift.dev (kitchenware) and on a wizard-created shop with an
  // empty catalog, 2026-09-12. A shop that says nothing beats a shop that promises
  // another shop's shipping terms; a per-tenant strip is a field the tenant document does
  // not have yet. A single-store deployment resolves no tenant and is untouched.
  //
  // Every other reader of the build profile's copy (footers f3/f5/f6, heroes h/m, nav
  // h3) goes through `lib/data/shop-copy.ts`, which answers null for a tenant.
  const suppressPromoBanner =
    (settings?.header ?? DEFAULT_HEADER) === "h3" || tenantHandle !== null

  return (
    <>
      <PromoBanner
        dismissed={promoBannerDismissed}
        suppressed={suppressPromoBanner}
      />
      {/* Nav and Footer are themselves the site-wide header/footer composition
          switches now (`nav/index.tsx`, `footer/index.tsx`): each reads
          `store.metadata.storefrontSettings` on its own — including Footer's own
          `footer === "none"` guard — so neither takes a composition prop from here
          (`2026-09-09-block-port-map.md` §2: header/footer are site-wide because
          they render once here, wrapping every route under `(main)`, cart and
          checkout included). This layout reads the same settings document only for
          `PromoBanner`'s H3 suppression above — a cache hit against `Nav`'s read,
          never a second source of truth. */}
      <Nav />
      <div className="pb-16 lg:pb-0">
        <Suspense fallback={null}>
          <CartNotifications />
        </Suspense>
        {props.children}
        <Footer />
      </div>
      <BottomNav />
    </>
  )
}
