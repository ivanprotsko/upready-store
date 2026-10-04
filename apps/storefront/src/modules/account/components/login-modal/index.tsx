"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"

import type { TelegramBot } from "@lib/data/telegram-bot"
import type { TenantLoginSettings } from "@lib/tenant/login-settings"
import type { LegalLinkContext } from "@lib/util/legal-links"
import LoginTemplate from "@modules/account/templates/login-template"
import { CheckoutModal } from "@modules/checkout/components/checkout-modal"

import {
  closeLoginModal,
  openLoginModal,
  setLoginModalAvailable,
  useLoginModal,
} from "./store"

/** `/ru/account`, `/ru/account/…`: the page that already is the sign-in screen. */
function isAccountPath(pathname: string): boolean {
  return pathname.split("/").filter(Boolean)[1] === "account"
}

type Props = {
  loginSettings: TenantLoginSettings
  telegramBot: TelegramBot | null
  siteName: string
  legal: LegalLinkContext
}

/**
 * The sign-in modal (t-2026-10-04-24, Ivan 04.10: «вход нужно сделать в popup без перехода на
 * другую страницу»). Every «Войти» of a guest opens it over the page they are on
 * (`AccountLink`); the URL and the page underneath stay.
 *
 * It holds `/account`'s own sign-in screen, `LoginTemplate`, so the methods are the cart
 * sidebar's block (`SignInMethods`) and registration and the password reset are a click away
 * inside it. Every way in comes back to the address under the modal: the e-mail forms
 * redirect there, Telegram and Yandex ID take it as their `return`. That redirect renders the
 * layout again for a customer, `LoginModalHost` draws no modal any more, and this unmounts:
 * the modal is gone and the page shows the signed-in state, with the cart and the checkout
 * step where they were.
 *
 * Yandex ID leaves the page by design and comes back to it; when it comes back with
 * `?yandex_error=…` the modal opens by itself, so the buyer reads why on the page they
 * started from. `/account` shows that message in its own page and is left alone.
 */
export default function LoginModal({ loginSettings, telegramBot, siteName, legal }: Props) {
  const t = useTranslations("Login")
  const { open, email } = useLoginModal()
  const pathname = usePathname() ?? "/"
  const searchParams = useSearchParams()
  const query = searchParams?.toString()
  const returnTo = query ? `${pathname}?${query}` : pathname
  const yandexError = searchParams?.get("yandex_error") ?? null

  useEffect(() => {
    setLoginModalAvailable(true)
    return () => setLoginModalAvailable(false)
  }, [])

  useEffect(() => {
    if (yandexError && !isAccountPath(pathname)) openLoginModal()
  }, [yandexError, pathname])

  return (
    <CheckoutModal open={open} onClose={closeLoginModal} title={t("heading")}>
      <div className="pb-2" data-testid="login-modal">
        <LoginTemplate
          siteName={siteName}
          legal={legal}
          loginSettings={loginSettings}
          telegramBot={telegramBot}
          returnTo={returnTo}
          inModal
          emailOpen={email}
        />
      </div>
    </CheckoutModal>
  )
}
