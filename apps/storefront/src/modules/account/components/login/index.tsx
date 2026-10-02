"use client"

import { login } from "@lib/data/customer"
import { allowsEmailLogin, yandexLoginAvailable, type TenantLoginSettings } from "@lib/tenant/login-settings"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"
import YandexLogin from "@modules/account/components/yandex-login"
import TelegramLogin from "@modules/account/components/telegram-login"
import type { TelegramBot } from "@lib/data/telegram-bot"
import { useActionState } from "react"
import { useTranslations } from "next-intl"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
  /** From the server page, through `LoginTemplate` (rule 19g) — which forms this shop's buyers get. */
  loginSettings: TenantLoginSettings
  /** This shop's own Telegram bot, or null — from the same server page (rule 19g). */
  telegramBot: TelegramBot | null
  /** Where to send the buyer after signing in, from the same server page (rule 19g). */
  returnTo: string | null
}

const Login = ({ setCurrentView, loginSettings, telegramBot, returnTo }: Props) => {
  const t = useTranslations("Login")
  const [message, formAction] = useActionState(login, null)
  const emailEnabled = allowsEmailLogin(loginSettings.method)
  const yandexEnabled = yandexLoginAvailable(loginSettings)

  return (
    <div
      className="max-w-sm w-full flex flex-col items-center"
      data-testid="login-page"
    >
      <h1 className="text-large-semi uppercase mb-6">{t("heading")}</h1>
      <p className="text-center text-base-regular text-ui-fg-base mb-8">
        {t("description")}
      </p>
      {emailEnabled && (
        <form className="w-full" action={formAction}>
          {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
          <div className="flex flex-col w-full gap-y-2">
            <Input
              label={t("email")}
              name="email"
              type="email"
              title={t("emailTitle")}
              autoComplete="email"
              required
              data-testid="email-input"
            />
            <Input
              label={t("password")}
              name="password"
              type="password"
              autoComplete="current-password"
              required
              data-testid="password-input"
            />
          </div>
          <div className="flex justify-end mt-2">
            <button
              type="button"
              onClick={() => setCurrentView(LOGIN_VIEW.FORGOT_PASSWORD)}
              className="text-small-regular text-ui-fg-interactive hover:text-ui-fg-interactive-hover underline"
              data-testid="forgot-password-button"
            >
              {t("forgotPassword")}
            </button>
          </div>
          <ErrorMessage error={message} data-testid="login-error-message" />
          <SubmitButton
            size="large"
            data-testid="sign-in-button"
            className="w-full mt-6"
          >
            {t("signIn")}
          </SubmitButton>
        </form>
      )}
      {/* Renders nothing when this shop turned Yandex ID off, or the platform
          has no keys at all — o25-login-methods, @lib/tenant/login-settings. */}
      <YandexLogin available={yandexEnabled} />
      <TelegramLogin
        bot={telegramBot}
        returnTo={returnTo}
        withDivider={!yandexEnabled && emailEnabled}
      />
      {emailEnabled && (
        <span className="text-center text-ui-fg-base text-small-regular mt-6">
          {t("notMember")}{" "}
          <button
            onClick={() => setCurrentView(LOGIN_VIEW.REGISTER)}
            className="underline"
            data-testid="register-button"
          >
            {t("joinUs")}
          </button>
          .
        </span>
      )}
    </div>
  )
}

export default Login
