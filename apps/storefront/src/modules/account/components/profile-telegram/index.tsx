"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import type { HttpTypes } from "@medusajs/types"

import {
  linkTelegramToAccount,
  type TelegramLinkError,
  type TelegramWidgetUser,
} from "@lib/data/telegram-auth"
import type { TelegramBot } from "@lib/data/telegram-bot"
import { telegramHandle } from "@lib/util/telegram-contact"
import TelegramWidget from "@modules/account/components/telegram-login/widget"

const ERROR_KEYS: Record<TelegramLinkError, string> = {
  taken: "errorTaken",
  rejected: "errorRejected",
  failed: "errorFailed",
}

/** «Привязать Telegram»: one more way into the same account, for a buyer signed in by e-mail. */
const ProfileTelegram = ({
  customer,
  bot,
}: {
  customer: HttpTypes.StoreCustomer
  bot: TelegramBot | null
}) => {
  const t = useTranslations("ProfileTelegram")
  const router = useRouter()
  const [error, setError] = useState<TelegramLinkError | null>(null)
  const [pending, startTransition] = useTransition()

  if (!bot) {
    return null
  }

  const linked = typeof customer.metadata?.telegram_id === "number"
  const handle = linked ? telegramHandle(customer) : null

  const onAuth = (user: TelegramWidgetUser) =>
    startTransition(async () => {
      setError(null)
      const failure = await linkTelegramToAccount(user)
      if (failure) {
        setError(failure)
        return
      }
      router.refresh()
    })

  return (
    <div className="text-small-regular" data-testid="account-telegram">
      <div className="flex flex-col">
        <span className="uppercase text-ui-fg-base">{t("label")}</span>
        <span className="font-semibold" data-testid="telegram-link-state">
          {linked ? t("linked", { handle: handle ?? "" }) : t("notLinked")}
        </span>
      </div>
      {!linked && (
        <div className="flex flex-col gap-y-3 pt-4">
          <p className="text-ui-fg-subtle">{t("hint")}</p>
          <div
            className={pending ? "opacity-60 pointer-events-none" : undefined}
            aria-busy={pending}
          >
            <TelegramWidget botUsername={bot.username} onAuth={onAuth} />
          </div>
        </div>
      )}
      {error && (
        <p className="pt-3 text-rose-500" data-testid="telegram-link-error">
          {t(ERROR_KEYS[error])}
        </p>
      )}
    </div>
  )
}

export default ProfileTelegram
