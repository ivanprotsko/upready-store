"use client"

import { useState } from "react"

import Register from "@modules/account/components/register"
import Login from "@modules/account/components/login"
import ForgotPassword from "@modules/account/components/forgot-password"
import type { LegalLinkContext } from "@lib/util/legal-links"
import { allowsEmailLogin, type TenantLoginSettings } from "@lib/tenant/login-settings"
import type { TelegramBot } from "@lib/data/telegram-bot"

export enum LOGIN_VIEW {
  SIGN_IN = "sign-in",
  REGISTER = "register",
  FORGOT_PASSWORD = "forgot-password",
}

/**
 * `siteName` comes from the server page (`account/@login/page.tsx`) as a PROP:
 * this whole tree is client, and `Register` below needs the tenant's name in
 * its copy, so it must never import the `next/headers`-reading accessor
 * directly (rule 19g). `legal` and `loginSettings` travel the same way, for
 * the same reason: the signup consent sentence links the shop's own documents
 * (f05-checkout-legal-stubs), and which forms to draw is o25-login-methods.
 *
 * REGISTER and FORGOT_PASSWORD are email-and-password concepts — Yandex ID has
 * no password to register or reset (`YandexAuthService.register`, the account
 * is created on the first callback). `Login` already hides the triggers into
 * those views when the shop turned email off, and the guard here is
 * defence in depth: a Yandex-only shop never actually renders either, whatever
 * `currentView` claims.
 */
const LoginTemplate = ({
  siteName,
  legal,
  loginSettings,
  telegramBot,
  returnTo,
}: {
  siteName: string
  legal: LegalLinkContext
  loginSettings: TenantLoginSettings
  /** This shop's own bot, or null: then no Telegram control (rule 19g, from the server page). */
  telegramBot: TelegramBot | null
  /** Where to send the buyer after signing in, from the server page's `?return=` (rule 19g). */
  returnTo: string | null
}) => {
  const [currentView, setCurrentView] = useState<LOGIN_VIEW>(
    LOGIN_VIEW.SIGN_IN
  )
  const emailEnabled = allowsEmailLogin(loginSettings.method)

  return (
    <div className="w-full flex justify-center px-8 py-8">
      {currentView === LOGIN_VIEW.SIGN_IN && (
        <Login
          setCurrentView={setCurrentView}
          loginSettings={loginSettings}
          telegramBot={telegramBot}
          returnTo={returnTo}
        />
      )}
      {currentView === LOGIN_VIEW.REGISTER && emailEnabled && (
        <Register
          setCurrentView={setCurrentView}
          siteName={siteName}
          legal={legal}
          returnTo={returnTo}
        />
      )}
      {currentView === LOGIN_VIEW.FORGOT_PASSWORD && emailEnabled && (
        <ForgotPassword setCurrentView={setCurrentView} />
      )}
    </div>
  )
}

export default LoginTemplate
