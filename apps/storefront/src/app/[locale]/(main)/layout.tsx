import type { Metadata } from "next"
import { Suspense } from "react"

import { getPromoBannerDismissed } from "@lib/data/cookies"
import { getBaseURL } from "@lib/util/env"
import BottomNav from "@modules/layout/components/bottom-nav"
import CartNotifications from "@modules/layout/components/cart-notifications"
import PromoBanner from "@modules/layout/components/promo-banner"
import Footer from "@modules/layout/templates/footer"
import Nav from "@modules/layout/templates/nav"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

export default async function PageLayout(props: { children: React.ReactNode }) {
  // Only the promo-banner cookie is read here — it is a cookie lookup, not a
  // fetch. Everything that talks to the backend lives behind a <Suspense>
  // boundary so it cannot delay the page content below.
  const promoBannerDismissed = await getPromoBannerDismissed()

  return (
    <>
      <PromoBanner dismissed={promoBannerDismissed} />
      {/* Nav and Footer are themselves the site-wide header/footer composition
          switches now (`nav/index.tsx`, `footer/index.tsx`): each reads
          `store.metadata.storefrontSettings` on its own — including Footer's own
          `footer === "none"` guard — so this layout stays the zero-knowledge
          wrapper it always was and needs no composition prop of its own
          (`2026-09-09-block-port-map.md` §2: header/footer are site-wide because
          they render once here, wrapping every route under `(main)`, cart and
          checkout included). */}
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
