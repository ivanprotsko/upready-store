import { Button, clx, Text } from "@medusajs/ui"
import { getTranslations } from "next-intl/server"

import { getTelegramBot } from "@lib/data/telegram-bot"
import { getSiteLoginSettings } from "@lib/data/tenant-login-settings"
import { allowsEmailLogin, yandexLoginAvailable } from "@lib/tenant/login-settings"
import AccountLink from "@modules/layout/components/account-link"
import TelegramLogin from "@modules/account/components/telegram-login"
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
 * password (with registration on the same page), Yandex ID when the shop has
 * it, and Telegram when the shop has connected its own bot (`getTelegramBot`,
 * null renders nothing).
 */
export default async function CheckoutSignIn({ returnTo, hasCourse }: Props) {
  const [t, tSide, loginSettings, telegramBot] = await Promise.all([
    getTranslations("CheckoutPage"),
    getTranslations("CartSidebar"),
    getSiteLoginSettings(),
    getTelegramBot(),
  ])
  const emailSignIn = allowsEmailLogin(loginSettings.method)
  const yandexSignIn = yandexLoginAvailable(loginSettings)
  const methods = [emailSignIn, telegramBot !== null, yandexSignIn].filter(Boolean).length

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
      {/* One grid of equal cells (t-2026-10-03-65, Ivan: «кнопки которые стоят рядом» never
          differ in size): two to a row from 1024 px, a third one alone on its own row at
          full width. Telegram renders nothing when this shop has no bot of its own
          (`getTelegramBot` returns null). */}
      <div
        className={clx("grid grid-cols-1 gap-2", methods > 1 && "small:grid-cols-2")}
        data-testid="checkout-sign-in-methods"
      >
        {emailSignIn && (
          <AccountLink className="flex w-full" emailForm>
            <Button variant="primary" size="large" className="w-full min-w-0" data-testid="checkout-sign-in-button">
              {tSide("signInEmail")}
            </Button>
          </AccountLink>
        )}
        <TelegramLogin bot={telegramBot} returnTo={returnTo} cell label={tSide("signInTelegram")} />
        {yandexSignIn && (
          <Button
            asChild
            variant="secondary"
            size="large"
            className={clx("w-full min-w-0", methods === 3 && "small:col-span-2")}
            data-testid="checkout-sign-in-yandex"
          >
            <a href={`/api/yandex-login?return=${encodeURIComponent(returnTo)}`}>
              <YandexMark />
              {tSide("signInYandex")}
            </a>
          </Button>
        )}
      </div>
    </div>
  )
}
