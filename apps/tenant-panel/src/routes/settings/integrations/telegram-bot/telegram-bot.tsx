import { useState } from "react"
import { Alert, Badge, Button, Container, Heading, Input, Label, Text, toast, usePrompt } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SingleColumnPage } from "../../../../components/layout/pages"
import {
  useDeleteTelegramBot,
  useSaveTelegramBot,
  useTelegramBot,
} from "../../../../hooks/api/telegram-bot"

/**
 * «Подключение → Telegram» — the shop's own bot, for buyer sign-in
 * (t-2026-10-02-telegram-auth).
 *
 * WHAT THIS PAGE DOES NOT DO, said on the screen itself: it does not put the
 * bot's domain on the Login Widget's allow-list, and it does not touch the
 * bot's menu button or webhooks. Those are @BotFather steps only Ivan can do
 * (`/setdomain`) — the Bot API has no endpoint for either, so no amount of
 * code here can do them (rule 17a: a page that stayed silent about that would
 * read as "Telegram sign-in is live" before it actually can be).
 *
 * Saving VERIFIES the token (the backend calls Telegram's `getMe`) before the
 * row is written, so a typo is rejected on this screen, not at a buyer's
 * sign-in click.
 */
export const TelegramBotIntegration = () => {
  const { t } = useTranslation()
  const prompt = usePrompt()

  const { telegramBot, isPending, isError, error } = useTelegramBot()
  const stored = telegramBot?.settings?.token.set ?? false

  const [username, setUsername] = useState("")
  const [token, setToken] = useState("")
  const { mutateAsync: save, isPending: isSaving } = useSaveTelegramBot()
  const { mutateAsync: remove, isPending: isRemoving } = useDeleteTelegramBot()

  if (isError) {
    throw error
  }

  const busy = isPending || isSaving || isRemoving

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!username.trim()) {
      toast.error(t("integrations.telegramBot.usernameRequired"))
      return
    }
    if (!token.trim()) {
      toast.error(t("integrations.telegramBot.tokenRequired"))
      return
    }
    try {
      const saved = await save({ username: username.trim(), token: token.trim() })
      setUsername("")
      setToken("")
      toast.success(
        t("integrations.telegramBot.saved", { username: saved.settings?.username ?? "" })
      )
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : String(saveError))
    }
  }

  const handleRemove = async () => {
    const confirmed = await prompt({
      title: t("integrations.telegramBot.removeTitle"),
      description: t("integrations.telegramBot.removeDescription"),
      confirmText: t("integrations.telegramBot.remove"),
      cancelText: t("integrations.telegramBot.cancel"),
    })
    if (!confirmed) {
      return
    }
    try {
      await remove()
      setUsername("")
      setToken("")
      toast.success(t("integrations.telegramBot.removed"))
    } catch (removeError) {
      toast.error(removeError instanceof Error ? removeError.message : String(removeError))
    }
  }

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <Heading>{t("integrations.telegramBot.title")}</Heading>
            <Text className="text-ui-fg-subtle" size="small">
              {t("integrations.telegramBot.subtitle")}
            </Text>
          </div>
          {isPending ? null : (
            <Badge
              size="2xsmall"
              color={stored ? "green" : "orange"}
              data-testid="telegram-bot-state"
            >
              {stored
                ? t("integrations.state.connectedAs", {
                    username: telegramBot?.settings?.username ?? "",
                  })
                : t("integrations.state.missing")}
            </Badge>
          )}
        </div>

        <div className="px-6 py-4">
          <Alert variant="info" data-testid="telegram-bot-botfather-hint">
            {t("integrations.telegramBot.botFatherHint")}
          </Alert>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-y-4 px-6 py-6">
          <div className="flex flex-col gap-y-2">
            <Label htmlFor="telegram-bot-username">
              {t("integrations.telegramBot.usernameLabel")}
            </Label>
            <Input
              id="telegram-bot-username"
              name="username"
              data-testid="telegram-bot-username"
              value={username}
              disabled={busy}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={
                stored
                  ? telegramBot?.settings?.username ?? ""
                  : t("integrations.telegramBot.usernamePlaceholder")
              }
            />
          </div>

          <div className="flex flex-col gap-y-2">
            <Label htmlFor="telegram-bot-token">{t("integrations.telegramBot.tokenLabel")}</Label>
            <Input
              id="telegram-bot-token"
              name="token"
              type="password"
              autoComplete="new-password"
              data-testid="telegram-bot-token"
              value={token}
              disabled={busy}
              onChange={(event) => setToken(event.target.value)}
              placeholder={
                stored
                  ? t("integrations.telegramBot.keepPlaceholder")
                  : t("integrations.telegramBot.emptyPlaceholder")
              }
            />
            <Text className="text-ui-fg-subtle" size="small">
              {t("integrations.telegramBot.tokenHint")}
            </Text>
          </div>

          <div className="flex items-center gap-x-2">
            <Button
              type="submit"
              size="small"
              isLoading={isSaving}
              disabled={busy}
              data-testid="telegram-bot-save"
            >
              {t("integrations.telegramBot.save")}
            </Button>
            {stored ? (
              <Button
                type="button"
                size="small"
                variant="danger"
                isLoading={isRemoving}
                disabled={busy}
                onClick={handleRemove}
                data-testid="telegram-bot-remove"
              >
                {t("integrations.telegramBot.remove")}
              </Button>
            ) : null}
          </div>
        </form>
      </Container>
    </SingleColumnPage>
  )
}
