import type { Metadata } from "next"
import { Suspense } from "react"
import { getTranslations } from "next-intl/server"

import {
  getPromoBannerDismissed,
  getRequestBaseURL,
  getTenantHandle,
} from "@lib/data/cookies"
import { getEffectiveSettings } from "@lib/data/tenant-home"
import { getSeoVerification } from "@lib/data/seo-verification"
import { DEFAULT_HEADER } from "@modules/layout/templates/nav/variants"
import HydrationSlot from "@modules/common/components/hydration-slot"
import LoginModalHost from "@modules/account/components/login-modal/host"
import BottomNav from "@modules/layout/components/bottom-nav"
import CartNotifications from "@modules/layout/components/cart-notifications"
import { CartSidebarProvider } from "@modules/layout/components/cart-sidebar/context"
import CartSidebarHost from "@modules/layout/components/cart-sidebar/host"
import PromoBanner from "@modules/layout/components/promo-banner"
import Footer from "@modules/layout/templates/footer"
import Nav from "@modules/layout/templates/nav"

// Per request, same reason as the root layout: see `lib/tenant/origin.ts`.
export async function generateMetadata(): Promise<Metadata> {
  const [base, seoVerification] = await Promise.all([
    getRequestBaseURL(),
    getSeoVerification(),
  ])

  return {
    metadataBase: new URL(base),
    ...(seoVerification
      ? {
          verification: {
            ...(seoVerification.google ? { google: seoVerification.google } : {}),
            ...(seoVerification.yandex ? { yandex: seoVerification.yandex } : {}),
          },
        }
      : {}),
  }
}

export default async function PageLayout(props: { children: React.ReactNode }) {
  // The promo-banner cookie is a cookie lookup, not a fetch. The settings read
  // shares its cache tag with `Nav`'s own read below (`storefront-settings`,
  // Next's fetch request memoization) so this costs no second round trip.
  const [promoBannerDismissed, settings, tenantHandle, t] = await Promise.all([
    getPromoBannerDismissed(),
    getEffectiveSettings(),
    getTenantHandle(),
    getTranslations("Nav"),
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
      {/* A-20 (46df audit, B-07, WCAG 2.2 SC 2.4.1): the first focusable element
          on every `(main)` page, ahead of even `PromoBanner`'s own close
          button — a keyboard or screen-reader visitor's very first Tab lands
          here, not several header controls in. `sr-only` until focused, the
          same convention the rest of this app uses for visually-hidden text. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:border focus:border-ui-border-base focus:bg-ui-bg-base focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ui-fg-base"
      >
        {t("skipToContent")}
      </a>
      {/* The cart sidebar's open state (batch 5) is shared by the header's «Корзина»
          trigger, the sidebar itself and every «В корзину» under this layout. */}
      <CartSidebarProvider>
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
          {/* Footer is async, so a lazy row in the RSC payload: the slot keeps it
              off this <div>'s own children, see HydrationSlot (46df U-06). */}
          <HydrationSlot>
            <Suspense fallback={null}>
              <CartNotifications />
            </Suspense>
            {/* The page is the one `main` landmark; the header above is `banner` and the
                footer below `contentinfo` because they sit outside it. */}
            <main id="main-content">{props.children}</main>
            <Footer />
            {/* The desktop cart sidebar, rendered once for the whole page (the header draws
                its trigger up to three times); async, so behind its own Suspense. */}
            <Suspense fallback={null}>
              <CartSidebarHost />
            </Suspense>
            {/* The sign-in modal every guest «Войти» opens (t-2026-10-04-24); none for a customer. */}
            <Suspense fallback={null}>
              <LoginModalHost />
            </Suspense>
          </HydrationSlot>
        </div>
        <BottomNav />
      </CartSidebarProvider>
    </>
  )
}
