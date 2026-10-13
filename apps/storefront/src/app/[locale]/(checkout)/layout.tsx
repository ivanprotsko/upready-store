import { retrieveCustomer } from "@lib/data/customer"
import { getSiteName } from "@lib/data/cookies"
import { customerAvatarUrl, customerInitials } from "@lib/util/customer-avatar"
import { customerContactLabel } from "@lib/util/telegram-contact"
import { ArrowLeft } from "@medusajs/icons"
import { Link } from "@i18n/navigation"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import SiteAttribution from "@modules/layout/components/site-attribution"
import HydrationSlot from "@modules/common/components/hydration-slot"
import { NOINDEX } from "@lib/util/robots"
import AccountLink from "@modules/layout/components/account-link"
import CustomerAvatar from "@modules/layout/components/customer-avatar"
import HeaderLogo from "@modules/layout/components/header-logo"
import CartQueueGate from "@modules/checkout/components/cart-queue-gate"
import LoginModalHost from "@modules/account/components/login-modal/host"
import { Suspense } from "react"

export const metadata: Metadata = {
  robots: NOINDEX,
}

export default async function CheckoutLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [customer, t, siteName] = await Promise.all([
    retrieveCustomer(),
    getTranslations("CheckoutPage"),
    getSiteName(),
  ])

  return (
    <div className="min-h-screen bg-ui-bg-base flex flex-col">
      <header className="border-b border-ui-border-base bg-ui-bg-base sticky top-0 z-40">
        <div className="flex items-center gap-x-2 content-container h-16">
          {/* The two sides take what they need on a phone and a third each from 640 px, so the
              logo sits in the middle wherever there is room for it. */}
          <div className="flex flex-none items-center sm:flex-1">
            {/* Ivan 12.10 14:23 (t-2026-10-12-05, item 1.2): «сделать контрол, который бы
                позволял вернуться обратно в корзину». It replaces Ivan 04.10 08:40
                (t-2026-10-04-22), «no «В корзину» control on the checkout»: the order list
                here is read-only now (item 6.1), so the cart is where the order changes.
                Ivan 13.10 ~19:15 (t-2026-10-13-20): «кнопку назад в виде обычной иконки со
                стрелкой назад». The arrow alone at every width, in the 40 px round target of
                the Olavka header's icon buttons, pulled 12 px outward so the arrow itself stays
                on the page's start edge. «Вернуться в корзину» is its accessible name. */}
            <Link
              href="/cart"
              aria-label={t("backToCart")}
              className="-ms-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ui-fg-subtle transition-colors hover:bg-[var(--accent)] hover:text-ui-fg-base focus-visible:rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              data-testid="checkout-back-to-cart"
            >
              <ArrowLeft className="rtl:rotate-180" aria-hidden />
            </Link>
          </div>

          {/* Ivan 12.10 (item 1.1): «сделать логотип как на основном сайте». */}
          <HeaderLogo testId="store-link" />

          <div className="flex min-w-0 flex-none items-center justify-end sm:flex-1">
            {customer ? (
              // Ivan 12.10 (item 6.2): the avatar, not a user icon, and not clickable. No link,
              // no button, no hover: the label beside it is the one place the name reads.
              <div
                className="flex min-w-0 items-center gap-x-2 cursor-default txt-compact-medium text-ui-fg-subtle"
                data-testid="checkout-customer"
              >
                <CustomerAvatar
                  src={customerAvatarUrl(customer)}
                  initials={customerInitials(customer)}
                />
                <span className="sr-only md:not-sr-only md:truncate text-xs">
                  {customerContactLabel(customer)}
                </span>
              </div>
            ) : (
              <AccountLink className="txt-compact-medium text-ui-fg-base hover:text-ui-fg-subtle transition-colors">
                {t("signIn")}
              </AccountLink>
            )}
          </div>
        </div>
      </header>

      {/* Inert while the client cart queue still sends a change (t-2026-10-03-66). */}
      <CartQueueGate className="flex-1" data-testid="checkout-container">
        {children}
      </CartQueueGate>

      <footer className="border-t border-ui-border-base bg-ui-bg-base">
        {/* t-2026-10-09-56: the «Доставка» and «Правила возврата» links this footer
            repeated stand once now, right above the pay button (`RobokassaTermsLinks`). */}
        <div className="flex flex-col items-center gap-2 content-container py-4 text-center lg:hidden">
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

      {/* The sign-in modal the header's «Войти» and the sign-in step open (t-2026-10-04-24).
          Kept for a customer too: the step's «Изменить» signs in with another account
          (t-2026-10-12-05). */}
      <Suspense fallback={null}>
        <LoginModalHost forCustomer />
      </Suspense>
    </div>
  )
}
