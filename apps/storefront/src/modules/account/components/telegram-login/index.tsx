"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"

import {
  signInWithTelegramWidget,
  type TelegramSignInError,
  type TelegramWidgetUser,
} from "@lib/data/telegram-auth"
import type { TelegramBot } from "@lib/data/telegram-bot"
import TelegramWidget from "./widget"

const ERROR_KEYS: Record<TelegramSignInError, string> = {
  unconfigured: "telegramErrorUnconfigured",
  rejected: "telegramErrorRejected",
  expired: "telegramErrorExpired",
  failed: "telegramErrorFailed",
}

/**
 * «Войти через Telegram». `bot` is null for a shop without its own bot, and
 * then nothing renders. `returnTo` is the page's `?return=`, so checkout's
 * «Войти» comes back to checkout.
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
      const failure = await signInWithTelegramWidget(user, returnTo)
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
      <div
        className={pending ? "opacity-60 pointer-events-none" : undefined}
        aria-busy={pending}
      >
        <TelegramWidget botUsername={bot.username} onAuth={onAuth} />
      </div>
      {error && (
        <div
          className="pt-3 w-full text-center text-rose-500 text-small-regular"
          data-testid="telegram-login-error"
        >
          <span>{t(ERROR_KEYS[error])}</span>
        </div>
      )}
    </div>
  )
}

export default TelegramLogin
