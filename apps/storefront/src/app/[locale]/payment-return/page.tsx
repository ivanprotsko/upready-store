import { getSiteName } from "@lib/data/cookies"
import { getSiteBranding } from "@lib/data/tenant-branding"
import { pageTitle } from "@lib/util/page-title"
import { NOINDEX } from "@lib/util/robots"
import { Link } from "@i18n/navigation"
import { Button } from "@medusajs/ui"
import PaymentReturnWaiting from "@modules/checkout/components/payment-return-waiting"
import Spinner from "@modules/common/icons/spinner"
import SiteLogo from "@modules/layout/components/site-logo"
import type { Metadata } from "next"
import { getLocale, getTranslations } from "next-intl/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("PaymentReturn")

  return {
    title: await pageTitle(t("heading")),
    robots: NOINDEX,
  }
}

/**
 * Where Robokassa's success return lands (t-2026-10-04-48), at once and in the
 * shop's own colours. Ivan: «надо добавить логотип и какую-то надпись сейчас вы
 * будете перенаправлены обратно в магазин, если это не происходит — нажмите
 * "Вернуться в магазин"». The page asks the backend for the order for about half a
 * minute (`PaymentReturnWaiting`) and opens the confirmation page, or the filled
 * checkout with the pending notice. The link goes to that same checkout and is
 * there from the first paint, so a buyer never waits on a page with no way on.
 *
 * Outside the (main) and (checkout) groups on purpose: no header, no cart, nothing
 * to click away into while the payment is being checked. Reads no cart either, so
 * it renders as fast as the shop's branding does.
 */
export default async function PaymentReturnPage() {
  const [t, locale, siteName, branding] = await Promise.all([
    getTranslations("PaymentReturn"),
    getLocale(),
    getSiteName(),
    getSiteBranding(),
  ])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-ui-bg-base px-6 py-12">
      <div
        role="status"
        className="flex w-full max-w-sm flex-col items-center gap-y-6 text-center"
        data-testid="payment-return-waiting"
      >
        <span
          className="txt-xlarge-plus font-semibold uppercase text-ui-fg-base"
          data-testid="payment-return-logo"
        >
          <SiteLogo siteName={siteName} branding={branding} />
        </span>
        <span className="text-ui-fg-subtle">
          <Spinner size={32} aria-hidden />
        </span>
        <div className="flex flex-col gap-y-2">
          <h1 className="txt-xlarge-plus text-ui-fg-base">{t("heading")}</h1>
          <p className="txt-medium text-ui-fg-subtle">{t("text")}</p>
          <p className="txt-medium text-ui-fg-subtle">
            {t("hint", { button: t("backToShop") })}
          </p>
        </div>
        <Button asChild variant="secondary" size="large" className="w-full">
          <Link
            href="/checkout?payment=pending"
            data-testid="payment-return-back-link"
          >
            {t("backToShop")}
          </Link>
        </Button>
      </div>
      <PaymentReturnWaiting checkoutHref={`/${locale}/checkout?payment=pending`} />
    </main>
  )
}
