"use client"

import { Button, clx } from "@medusajs/ui"
import { useTranslations } from "next-intl"
import { useId, useState } from "react"

import type { TelegramBot } from "@lib/data/telegram-bot"
import { allowsEmailLogin, yandexLoginAvailable, type TenantLoginSettings } from "@lib/tenant/login-settings"
import type { LegalLinkContext } from "@lib/util/legal-links"
import TelegramLogin from "@modules/account/components/telegram-login"
import YandexIdButton from "@modules/account/components/yandex-login/yandex-id-button"

import SignInEmailForms from "./email-forms"

export type SignInMethodsProps = {
  loginSettings: TenantLoginSettings
  telegramBot: TelegramBot | null
  /** The page to come back to once signed in: the e-mail forms, Telegram and Yandex ID all use it. */
  returnTo: string
  siteName: string
  legal: LegalLinkContext
  /** Start with the e-mail form unfolded (the sign-in page, the checkout's «По эл. почте»). */
  emailOpen?: boolean
}

/**
 * This shop's own ways in (`lib/tenant/login-settings.ts`, `getTelegramBot`), one grid of equal
 * cells, as in Figma frame 3:60739 («По эл. почте» and «Через Телеграм» side by side): Ivan,
 * t-2026-10-03-65, «кнопки которые стоят рядом» are never of different sizes. Yandex ID is the
 * button from Yandex's own constructor (`YandexIdButton`) and always takes a row of its own. A shop with one method gets one button and nothing else:
 * no «или» divider with nothing above it, no empty gap (t-2026-10-04-24, cherkashino.ru is
 * Yandex ID only).
 *
 * The cart sidebar's sign-in block, shared since t-2026-10-04-24 with the sign-in modal and the
 * `/account` page, so all three draw the same thing.
 *
 * «По эл. почте» opens the e-mail sign-in right here instead of sending the buyer to `/account`
 * (t-2026-10-03-64, Ivan: «при клике на вход по электронной почте должны появлятся поля для
 * ввода логина и пароля»); a second click folds it away. The other methods stay in place above
 * the form.
 */
export default function SignInMethods({
  loginSettings,
  telegramBot,
  returnTo,
  siteName,
  legal,
  emailOpen: emailOpenInitially = false,
}: SignInMethodsProps) {
  const t = useTranslations("CartSidebar")
  const emailSignIn = allowsEmailLogin(loginSettings.method)
  const [emailOpen, setEmailOpen] = useState(emailOpenInitially && emailSignIn)
  const formId = useId()

  const yandexSignIn = yandexLoginAvailable(loginSettings)
  // Yandex ID is Yandex's own button (t-2026-10-04-45) on a row of its own: a half cell would be
  // under the constructor's 156 px minimum, so the grid pairs only e-mail and Telegram.
  const cells = [emailSignIn, telegramBot !== null].filter(Boolean).length
  // Labels sit in `truncate` spans: a 158 px cell keeps one line in every locale, so no
  // translation can make one button of the pair taller than the other.

  return (
    <div className="flex flex-col gap-y-3" data-testid="sign-in-methods">
      <div
        className={clx("grid gap-3", cells > 1 ? "grid-cols-2" : "grid-cols-1")}
        data-testid="cart-sidebar-sign-in-methods"
      >
        {emailSignIn ? (
          <Button
            type="button"
            variant="secondary"
            size="base"
            className="w-full min-w-0"
            aria-expanded={emailOpen}
            aria-controls={emailOpen ? formId : undefined}
            onClick={() => setEmailOpen((open) => !open)}
            data-testid="cart-sidebar-sign-in-email"
          >
            <span className="min-w-0 truncate">{t("signInEmail")}</span>
          </Button>
        ) : null}
        <TelegramLogin bot={telegramBot} returnTo={returnTo} cell size="base" label={t("signInTelegram")} />
        {yandexSignIn ? (
          <YandexIdButton
            returnTo={returnTo}
            className={clx(cells > 1 && "col-span-2")}
            data-testid="cart-sidebar-sign-in-yandex"
          />
        ) : null}
      </div>
      {emailSignIn && emailOpen ? (
        <SignInEmailForms id={formId} returnTo={returnTo} siteName={siteName} legal={legal} />
      ) : null}
    </div>
  )
}
