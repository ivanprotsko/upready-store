"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"

import {
  signInWithTelegramWidget,
  type TelegramSignInError,
  type TelegramWidgetUser,
} from "@lib/data/telegram-auth"
import type { TelegramBot } from "@lib/data/telegram-bot"
import { readWishlistStorage } from "@lib/util/wishlist-storage"
import TelegramButton from "./telegram-button"

const ERROR_KEYS: Record<TelegramSignInError, string> = {
  unconfigured: "telegramErrorUnconfigured",
  rejected: "telegramErrorRejected",
  expired: "telegramErrorExpired",
  failed: "telegramErrorFailed",
}

/**
 * «Войти через Телеграм». Drop it anywhere a buyer may sign in: the account
 * page, the checkout's sign-in gate, the cart sidebar.
 *
 *   import TelegramLogin from "@modules/account/components/telegram-login"
 *   <TelegramLogin bot={telegramBot} returnTo={returnTo} withDivider />
 *
 * - `bot` comes from `getTelegramBot()` (`@lib/data/telegram-bot`), read in a
 *   SERVER component and passed down (rule 19g: that module is server-only).
 *   It is null for a shop without its own bot, and then nothing renders.
 * - `returnTo` is the same-origin path to land on once signed in, e.g. the
 *   checkout; null lands on `/account`. The server action re-validates it.
 * - `withDivider` draws the «или» line above the button, for a place where
 *   another way to sign in comes first.
 *
 * On success the server action sets `_medusa_jwt` exactly as the e-mail login
 * does, moves the cart onto the customer, merges the guest wishlist and
 * redirects, so the caller needs no handler of its own.
 */
const TelegramLogin = ({
  bot,
  returnTo,
  withDivider,
}: {
  bot: TelegramBot | null
  returnTo: string | null
  withDivider: boolean
}) => {
  const t = useTranslations("Login")
  const [error, setError] = useState<TelegramSignInError | null>(null)
  const [pending, startTransition] = useTransition()

  if (!bot) {
    return null
  }

  const onAuth = (user: TelegramWidgetUser) =>
    startTransition(async () => {
      setError(null)
      const failure = await signInWithTelegramWidget(
        user,
        returnTo,
        readWishlistStorage(window.localStorage)
      )
      if (failure) {
        setError(failure)
      }
    })

  return (
    <div className="w-full flex flex-col items-center" data-testid="telegram-login">
      {withDivider ? (
        <div className="w-full flex items-center gap-x-3 my-6">
          <span className="h-px flex-1 bg-ui-border-base" />
          <span className="text-small-regular text-ui-fg-subtle">{t("telegramDivider")}</span>
          <span className="h-px flex-1 bg-ui-border-base" />
        </div>
      ) : (
        <div className="h-4" />
      )}
      <TelegramButton
        bot={bot}
        label={t("telegramCta")}
        pending={pending ? t("telegramPending") : null}
        onAuth={onAuth}
        testId="telegram-login-cta"
      />
      {error && (
        <div
          className="pt-3 w-full text-center text-ui-fg-error text-small-regular"
          data-testid="telegram-login-error"
        >
          <span>{t(ERROR_KEYS[error])}</span>
        </div>
      )}
    </div>
  )
}

export default TelegramLogin
