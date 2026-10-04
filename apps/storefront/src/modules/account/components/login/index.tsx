"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"

import type { TelegramBot } from "@lib/data/telegram-bot"
import { allowsEmailLogin, yandexLoginAvailable, type TenantLoginSettings } from "@lib/tenant/login-settings"
import type { LegalLinkContext } from "@lib/util/legal-links"
import SignInMethods from "@modules/account/components/sign-in-methods"
import YandexLoginError from "@modules/account/components/yandex-login"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
  /** From the server page, through `LoginTemplate` (rule 19g) — which forms this shop's buyers get. */
  loginSettings: TenantLoginSettings
  /** This shop's own Telegram bot, or null — from the same server page (rule 19g). */
  telegramBot: TelegramBot | null
  /** Where to send the buyer after signing in; null means back to this very address. */
  returnTo: string | null
  siteName: string
  legal: LegalLinkContext
  /** Drawn inside the sign-in modal, whose own title already says «Вход». */
  inModal?: boolean
  /** Start with the e-mail form unfolded. */
  emailOpen?: boolean
}

/**
 * The sign-in view of `/account` for a guest and of the sign-in modal: a heading, one line on
 * what the account is for, and `SignInMethods`, the same block the cart sidebar draws
 * (t-2026-10-04-24, Ivan 04.10: «вход нужно сделать в popup без перехода на другую
 * страницу»). The «или» divider is gone with the old layout: it stood between the e-mail form
 * and Yandex ID, and on a Yandex-only shop (cherkashino.ru) it was a divider with nothing above
 * it under an empty gap. Registration is the e-mail form's own second button; «Забыли пароль?»
 * stays here, under the methods, for a shop that signs in by e-mail.
 */
const Login = ({
  setCurrentView,
  loginSettings,
  telegramBot,
  returnTo,
  siteName,
  legal,
  inModal = false,
  emailOpen = false,
}: Props) => {
  const t = useTranslations("Login")
  const pathname = usePathname() ?? "/"
  const searchParams = useSearchParams()
  const emailEnabled = allowsEmailLogin(loginSettings.method)
  const yandexEnabled = yandexLoginAvailable(loginSettings)

  // With no explicit `?return=` the buyer comes back to this same address, query string
  // included; the handlers re-validate it as a same-origin path before trusting it.
  const query = searchParams?.toString()
  const back = returnTo ?? (query ? `${pathname}?${query}` : pathname)

  return (
    <div
      className="max-w-sm w-full flex flex-col gap-y-6"
      data-testid="login-page"
    >
      <div className="flex flex-col items-center gap-y-3 text-center">
        {inModal ? null : <h1 className="text-large-semi uppercase">{t("heading")}</h1>}
        <p className="text-base-regular text-ui-fg-base">{t("description")}</p>
      </div>
      <SignInMethods
        loginSettings={loginSettings}
        telegramBot={telegramBot}
        returnTo={back}
        siteName={siteName}
        legal={legal}
        emailOpen={emailOpen}
      />
      <YandexLoginError available={yandexEnabled} />
      {emailEnabled && (
        <button
          type="button"
          onClick={() => setCurrentView(LOGIN_VIEW.FORGOT_PASSWORD)}
          className="self-center text-small-regular text-ui-fg-interactive hover:text-ui-fg-interactive-hover underline"
          data-testid="forgot-password-button"
        >
          {t("forgotPassword")}
        </button>
      )}
    </div>
  )
}

export default Login
