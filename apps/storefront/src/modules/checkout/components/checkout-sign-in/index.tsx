import { Button, Text } from "@medusajs/ui"
import { getTranslations } from "next-intl/server"

import { getSiteLoginSettings } from "@lib/data/tenant-login-settings"
import { allowsEmailLogin, yandexLoginAvailable } from "@lib/tenant/login-settings"
import AccountLink from "@modules/layout/components/account-link"
import YandexMark from "@modules/account/components/yandex-login/yandex-mark"

type Props = {
  /** Where to come back to after the sign-in: the checkout path with its query (`?return=`). */
  returnTo: string
  /** A course in the cart retitles the block: the course opens in the account. */
  hasCourse: boolean
}

/**
 * Batch 7 (the lead's decision on Ivan's «уже появился в личном кабинете»): EVERY
 * checkout needs an account, not only a course cart — the order, its requisites,
 * its payment status and the bought course all live in «Мой кабинет». The pay
 * button stays disabled for a guest (`requiresSignIn`, `PaymentButton`); the cart
 * survives the sign-in (`login`/`signup` transfer it and come back to `returnTo`,
 * `lib/data/customer.ts`).
 *
 * The ways in are the shop's own (`lib/tenant/login-settings.ts`): e-mail and
 * password (with registration on the same page), Yandex ID when the shop has it,
 * and Telegram once its component lands (see the slot below).
 */
export default async function CheckoutSignIn({ returnTo, hasCourse }: Props) {
  const [t, tSide, loginSettings] = await Promise.all([
    getTranslations("CheckoutPage"),
    getTranslations("CartSidebar"),
    getSiteLoginSettings(),
  ])
  const emailSignIn = allowsEmailLogin(loginSettings.method)
  const yandexSignIn = yandexLoginAvailable(loginSettings)

  return (
    <div
      className="flex flex-col gap-y-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4"
      data-testid="checkout-sign-in"
      data-has-course={hasCourse ? "true" : undefined}
    >
      <h2 className="h2-docs">{t(hasCourse ? "courseSignInHeading" : "signInHeading")}</h2>
      <Text size="small" className="text-ui-fg-subtle">
        {t(hasCourse ? "courseSignInText" : "signInText")}
      </Text>
      <div className="flex flex-col gap-2 small:flex-row">
        {emailSignIn && (
          <AccountLink className="w-full small:w-auto">
            <Button variant="primary" size="large" className="w-full" data-testid="checkout-sign-in-button">
              {tSide("signInEmail")}
            </Button>
          </AccountLink>
        )}
        {yandexSignIn && (
          <Button asChild variant="secondary" size="large" className="w-full small:w-auto" data-testid="checkout-sign-in-yandex">
            <a href={`/api/yandex-login?return=${encodeURIComponent(returnTo)}`}>
              <YandexMark />
              {tSide("signInYandex")}
            </a>
          </Button>
        )}
        {/* TELEGRAM SLOT (batch 7): «Войти через Телеграм» goes here once the Telegram
            worker's component lands (`modules/account/components/telegram-login`,
            branch feat/telegram-login). It renders only when the shop's login settings
            have Telegram on; the lead passes the import path and the props. Not
            written here on purpose — no second Telegram implementation. */}
      </div>
    </div>
  )
}
