import { retrieveCustomer } from "@lib/data/customer"
import { getSiteName } from "@lib/data/cookies"
import { getLegalLinkContext } from "@lib/data/legal-links"
import { legalHref } from "@lib/util/legal-links"
import { ArrowLeft, UserMini } from "@medusajs/icons"
import { Link } from "@i18n/navigation"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import SiteAttribution from "@modules/layout/components/site-attribution"
import HydrationSlot from "@modules/common/components/hydration-slot"
import { NOINDEX } from "@lib/util/robots"
import BrandUnlock from "@modules/studio/components/brand-unlock"

export const metadata: Metadata = {
  robots: NOINDEX,
}

export default async function CheckoutLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [customer, t, siteName, legal] = await Promise.all([
    retrieveCustomer(),
    getTranslations("CheckoutPage"),
    getSiteName(),
    getLegalLinkContext(),
  ])

  // The mobile twin of the two links in `checkout-form`: same slots, same rule
  // (shown only while the shop has the page), because the two footers are the
  // same promise rendered at two widths (f05-checkout-legal-stubs).
  const shippingLink = legalHref("shipping", legal)
  const returnsLink = legalHref("returns", legal)

  return (
    <div className="min-h-screen bg-ui-bg-base flex flex-col">
      <header className="border-b border-ui-border-base bg-ui-bg-base sticky top-0 z-40">
        <div className="flex items-center content-container py-3 h-16">
          <div className="flex flex-1 items-center">
            <Link
              href="/cart"
              className="flex items-center gap-x-2 txt-compact-medium-plus text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
              data-testid="back-to-cart-link"
            >
              <ArrowLeft className="rtl:rotate-180" />
              <span className="hidden sm:inline">{t("backToCart")}</span>
              <span className="sm:hidden font-semibold uppercase whitespace-nowrap">
                {siteName}
              </span>
            </Link>
          </div>

          <BrandUnlock>
            <Link
              href="/"
              className="hidden sm:block shrink-0 txt-compact-medium font-semibold text-ui-fg-subtle uppercase hover:text-ui-fg-base transition-colors"
              data-testid="store-link"
            >
              {siteName}
            </Link>
          </BrandUnlock>

          <div className="flex flex-1 items-center justify-end">
            {customer ? (
              <div className="flex items-center gap-x-1 txt-compact-medium text-ui-fg-subtle">
                <UserMini />
                <span className="text-xs truncate hidden md:block">
                  {customer.email}
                </span>
              </div>
            ) : (
              <Link
                href="/account"
                className="txt-compact-medium text-ui-fg-base hover:text-ui-fg-subtle transition-colors"
              >
                {t("signIn")}
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1" data-testid="checkout-container">
        {children}
      </main>

      <footer className="border-t border-ui-border-base bg-ui-bg-base">
        <div className="flex flex-col items-center gap-2 content-container py-4 text-center lg:hidden">
          {shippingLink && (
            <Link href={shippingLink} className="text-base font-light text-ui-fg-subtle hover:text-ui-fg-base transition-colors">
              {t("shippingLink")}
            </Link>
          )}
          {returnsLink && (
            <Link href={returnsLink} className="text-base font-light text-ui-fg-subtle hover:text-ui-fg-base transition-colors">
              {t("returnsLink")}
            </Link>
          )}
          <span className="text-base font-light text-ui-fg-subtle">
            {t("copyright", {
              year: new Date().getFullYear(),
              siteName: siteName,
            })}
          </span>
        </div>

        <div className="hidden lg:flex items-center justify-between content-container gap-2 h-16">
          <span className="txt-compact-medium font-semibold text-ui-fg-subtle uppercase">
            {siteName}
          </span>
          {/* Async Server Component: see HydrationSlot (46df U-06). */}
          <HydrationSlot>
            <SiteAttribution />
          </HydrationSlot>
        </div>
      </footer>
    </div>
  )
}
