"use client"

import { User } from "@medusajs/icons"
import { Button, clx, Text } from "@medusajs/ui"
import { useTranslations } from "next-intl"
import { useId, useState } from "react"

import type { TelegramBot } from "@lib/data/telegram-bot"
import { allowsEmailLogin, yandexLoginAvailable, type TenantLoginSettings } from "@lib/tenant/login-settings"
import type { LegalLinkContext } from "@lib/util/legal-links"
import TelegramLogin from "@modules/account/components/telegram-login"
import YandexMark from "@modules/account/components/yandex-login/yandex-mark"

import CartSidebarEmailForms from "./email-forms"

/**
 * The guest block at the top of the cart sidebar: «Войдите, чтобы…» and this shop's own
 * ways in (`lib/tenant/login-settings.ts`, `getTelegramBot`).
 *
 * The methods are one grid of equal cells, as in Figma frame 3:60739 («По эл. почте» and
 * «Через Телеграм» side by side): Ivan, t-2026-10-03-65, «кнопки которые стоят рядом» are
 * never of different sizes. A third method takes a row of its own at full width.
 *
 * «По эл. почте» opens the e-mail sign-in right here instead of sending the buyer to
 * `/account` (t-2026-10-03-64, Ivan: «при клике на вход по электронной почте должны
 * появлятся поля для ввода логина и пароля»); a second click folds it away. The other
 * methods stay in place above the form. Rendered inside `Drawer.Content`, so closing the
 * sidebar unmounts it and the next opening starts folded.
 */
export default function CartSidebarSignIn({
  loginSettings,
  telegramBot,
  returnTo,
  siteName,
  legal,
}: {
  loginSettings: TenantLoginSettings
  telegramBot: TelegramBot | null
  returnTo: string
  siteName: string
  legal: LegalLinkContext
}) {
  const t = useTranslations("CartSidebar")
  const [emailOpen, setEmailOpen] = useState(false)
  const formId = useId()

  const emailSignIn = allowsEmailLogin(loginSettings.method)
  const yandexSignIn = yandexLoginAvailable(loginSettings)
  const methods = [emailSignIn, telegramBot !== null, yandexSignIn].filter(Boolean).length
  // Labels sit in `truncate` spans: a 158 px cell keeps one line in every locale, so no
  // translation can make one button of the pair taller than the other.

  return (
    <section
      className="flex flex-col gap-y-3 border-b border-dotted border-ui-border-strong px-4 py-4"
      data-testid="cart-sidebar-sign-in"
    >
      <div className="flex items-start gap-x-3">
        <Text size="small" leading="compact" className="flex-1 text-ui-fg-base">
          {t("signInPrompt")}
        </Text>
        <User className="mt-0.5 shrink-0 text-ui-fg-muted" aria-hidden />
      </div>
      <div
        className={clx("grid gap-3", methods > 1 ? "grid-cols-2" : "grid-cols-1")}
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
          <Button
            asChild
            variant="secondary"
            size="base"
            className={clx("w-full min-w-0", methods === 3 && "col-span-2")}
            data-testid="cart-sidebar-sign-in-yandex"
          >
            <a href={`/api/yandex-login?return=${encodeURIComponent(returnTo)}`}>
              <YandexMark />
              <span className="min-w-0 truncate">{t("signInYandex")}</span>
            </a>
          </Button>
        ) : null}
      </div>
      {emailSignIn && emailOpen ? (
        <CartSidebarEmailForms id={formId} returnTo={returnTo} siteName={siteName} legal={legal} />
      ) : null}
    </section>
  )
}
