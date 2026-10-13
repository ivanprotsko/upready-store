import { useState } from "react"
import { Alert, Badge, Button, Container, Heading, Input, Label, Text, toast, usePrompt } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SingleColumnPage } from "../../../../components/layout/pages"
import { useDomains } from "../../../../hooks/api/domains"
import {
  useConnectTelegramBotWebhook,
  useDeleteTelegramBot,
  useDisconnectTelegramBotWebhook,
  useSaveTelegramBot,
  useTelegramBot,
} from "../../../../hooks/api/telegram-bot"

/**
 * «Подключение → Telegram» — the shop's own bot, for buyer sign-in
 * (t-2026-10-02-telegram-auth).
 *
 * WHAT THIS PAGE DOES NOT DO, said on the screen itself: it does not put the
 * bot's domain on the Login Widget's allow-list. That is an @BotFather step
 * only the bot's owner can do (`/setdomain`) — the Bot API has no endpoint for
 * it, so no amount of code here can do it (rule 17a: a page that stayed silent
 * about that would read as "Telegram sign-in is live" before it actually can
 * be). The hint above the form walks the owner through it in four numbered
 * steps, with the shop's real address (primary host) to send (t-2026-10-14-11).
 *
 * Saving VERIFIES the token (the backend calls Telegram's `getMe`) before the
 * row is written, so a typo is rejected on this screen, not at a buyer's
 * sign-in click.
 *
 * THE WEBHOOK BLOCK BELOW (t-cherk-23, shop bot phase 1) is this page's own
 * doing: once a bot is saved, «Подключить бота» registers the shop's webhook
 * with Telegram, sets the bot's «Открыть магазин» menu button and shows the
 * manager deep link; «Отключить» tears the webhook down.
 */
export const TelegramBotIntegration = () => {
  const { t } = useTranslation()
  const prompt = usePrompt()

  const { telegramBot, isPending, isError, error } = useTelegramBot()
  const { primary_host: shopHost } = useDomains()
  const stored = telegramBot?.settings?.token.set ?? false

  const [username, setUsername] = useState("")
  const [token, setToken] = useState("")
  const { mutateAsync: save, isPending: isSaving } = useSaveTelegramBot()
  const { mutateAsync: remove, isPending: isRemoving } = useDeleteTelegramBot()
  const { mutateAsync: connectWebhook, isPending: isConnecting } = useConnectTelegramBotWebhook()
  const { mutateAsync: disconnectWebhook, isPending: isDisconnecting } =
    useDisconnectTelegramBotWebhook()

  if (isError) {
    throw error
  }

  const bot = telegramBot?.bot
  const webhookConnected = bot?.webhook_connected ?? false

  const busy = isPending || isSaving || isRemoving || isConnecting || isDisconnecting

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

  const handleConnectWebhook = async () => {
    try {
      await connectWebhook()
      toast.success(t("integrations.telegramBot.connected"))
    } catch (connectError) {
      toast.error(connectError instanceof Error ? connectError.message : String(connectError))
    }
  }

  const handleDisconnectWebhook = async () => {
    const confirmed = await prompt({
      title: t("integrations.telegramBot.disconnectTitle"),
      description: t("integrations.telegramBot.disconnectDescription"),
      confirmText: t("integrations.telegramBot.disconnect"),
      cancelText: t("integrations.telegramBot.cancel"),
    })
    if (!confirmed) {
      return
    }
    try {
      await disconnectWebhook()
      toast.success(t("integrations.telegramBot.disconnected"))
    } catch (disconnectError) {
      toast.error(disconnectError instanceof Error ? disconnectError.message : String(disconnectError))
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
            <Text size="small" weight="plus">
              {t("integrations.telegramBot.botFatherHint")}
            </Text>
            <ol className="mt-2 flex list-decimal flex-col gap-y-1 pl-5">
              <li>{t("integrations.telegramBot.botFatherStep1")}</li>
              <li>{t("integrations.telegramBot.botFatherStep2")}</li>
              <li>{t("integrations.telegramBot.botFatherStep3")}</li>
              <li>
                {shopHost
                  ? t("integrations.telegramBot.botFatherStep4", { host: shopHost })
                  : t("integrations.telegramBot.botFatherStep4NoHost")}
              </li>
            </ol>
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

        {stored ? (
          <div className="flex flex-col gap-y-4 px-6 py-6" data-testid="telegram-bot-webhook">
            <div className="flex items-center justify-between">
              <Heading level="h2">{t("integrations.telegramBot.webhookTitle")}</Heading>
              {isPending ? null : (
                <Badge
                  size="2xsmall"
                  color={webhookConnected ? "green" : "orange"}
                  data-testid="telegram-bot-webhook-state"
                >
                  {webhookConnected
                    ? t("integrations.telegramBot.webhookConnected")
                    : t("integrations.telegramBot.webhookNotConnected")}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-x-2">
              <Button
                type="button"
                size="small"
                isLoading={isConnecting}
                disabled={busy}
                onClick={handleConnectWebhook}
                data-testid="telegram-bot-webhook-connect"
              >
                {webhookConnected
                  ? t("integrations.telegramBot.reconnect")
                  : t("integrations.telegramBot.connect")}
              </Button>
              {webhookConnected ? (
                <Button
                  type="button"
                  size="small"
                  variant="danger"
                  isLoading={isDisconnecting}
                  disabled={busy}
                  onClick={handleDisconnectWebhook}
                  data-testid="telegram-bot-webhook-disconnect"
                >
                  {t("integrations.telegramBot.disconnect")}
                </Button>
              ) : null}
            </div>

            {webhookConnected && bot?.manager_link ? (
              <div className="flex flex-col gap-y-2" data-testid="telegram-bot-manager-link">
                <Label>{t("integrations.telegramBot.managerLinkLabel")}</Label>
                <a
                  href={bot.manager_link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-ui-fg-interactive"
                  data-testid="telegram-bot-manager-link-href"
                >
                  {bot.manager_link}
                </a>
                <Text className="text-ui-fg-subtle" size="small">
                  {t("integrations.telegramBot.managerLinkHint")}
                </Text>
                {bot.manager_linked ? (
                  <Badge size="2xsmall" color="green" data-testid="telegram-bot-manager-state">
                    {t("integrations.telegramBot.managerLinked")}
                  </Badge>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </Container>
    </SingleColumnPage>
  )
}
