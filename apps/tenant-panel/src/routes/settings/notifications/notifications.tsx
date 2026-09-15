import { useEffect, useRef, useState } from "react"
import { Badge, Button, Container, Heading, Input, Label, Text, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SingleColumnPage } from "../../../components/layout/pages"
import {
  type DeliveryStatus,
  useCreateTelegramLink,
  useNotificationSettings,
  useTestTelegram,
  useUnlinkTelegram,
  useUpdateNotificationSettings,
} from "../../../hooks/api/notification-settings"

// «Уведомления» (t08-order-notifications): кто узнаёт о новом заказе.
// Покупатель получает письмо, владелец — сообщение в Telegram.
//
// Две вещи здесь сделаны по правилу 19h, как и на экране оплаты. Пока запись
// грузится, рисуются НАСТОЯЩИЕ контролы, только выключенные, а не абзац вместо
// них: клик, попавший в это окно, браузер придержит на disabled-инпуте, а не
// съест вместе с подменённым элементом. И ответ приходит, когда решит сеть,
// поэтому он заполняет форму, только если владелец её ещё не трогал
// (`touchedRef`) — медленный ответ не затирает набранное.
//
// Последняя доставка каждого канала показана здесь же: молчание — не
// результат (правило 20a), и владелец должен видеть неудачу, не заглядывая в лог.

type Draft = { email_from_name: string; email_reply_to: string }

const EMPTY_DRAFT: Draft = { email_from_name: "", email_reply_to: "" }

// The backend surfaces a raw provider exception as `last.error`
// ("Could not find a notification provider for channel: email for
// notification id noti_…"). A shop owner has no use for that sentence, and
// the one failure this platform actually produces today — no mail server
// configured — already has a friendly explanation in `email.offHint`. Map
// that one recognized cause to it; anything else stays a generic failure
// notice rather than leaking a stack-shaped string onto the screen.
const getFriendlyDeliveryError = (
  t: (key: string) => string,
  rawError: string | null | undefined
): string | undefined => {
  if (!rawError) {
    return undefined
  }

  if (/notification provider/i.test(rawError)) {
    return t("notificationSettings.noProviderError")
  }

  return undefined
}

const LastDelivery = ({ last }: { last: DeliveryStatus | undefined }) => {
  const { t, i18n } = useTranslation()

  if (!last || !last.status) {
    return (
      <Text size="small" className="text-ui-fg-subtle">
        {t("notificationSettings.lastNever")}
      </Text>
    )
  }

  // The panel's own language, not the browser's: a Russian screen showing
  // «9/15/2026, 5:35 AM» reads as somebody else's date.
  const when = last.at ? new Date(last.at).toLocaleString(i18n.language) : ""

  if (last.status === "ok") {
    return (
      <Text size="small" className="text-ui-fg-subtle">
        {t("notificationSettings.lastOk", { when, order: last.order ?? "" })}
      </Text>
    )
  }

  const friendlyError = getFriendlyDeliveryError(t, last.error)

  return (
    <Text size="small" className="text-ui-fg-error">
      {t("notificationSettings.lastFailed", { when, order: last.order ?? "" })}
      {friendlyError ? ` — ${friendlyError}` : ""}
    </Text>
  )
}

export const NotificationSettings = () => {
  const { t } = useTranslation()
  const { settings, shop, isPending, isError, error } = useNotificationSettings()

  // `null` = ответа ещё не было; булево — уже есть. Третье состояние отдельно,
  // иначе «не знаем» читается как «выключено».
  const [loaded, setLoaded] = useState<boolean | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [deepLink, setDeepLink] = useState<string | null>(null)
  const touchedRef = useRef(false)

  useEffect(() => {
    if (isPending) {
      return
    }
    setLoaded(true)
    if (!touchedRef.current) {
      setDraft({
        email_from_name: settings?.email.from_name ?? "",
        email_reply_to: settings?.email.reply_to ?? "",
      })
    }
  }, [isPending, settings])

  const { mutateAsync: save, isPending: isSaving } = useUpdateNotificationSettings()
  const { mutateAsync: createLink, isPending: isLinking } = useCreateTelegramLink()
  const { mutateAsync: sendTest, isPending: isTesting } = useTestTelegram()
  const { mutateAsync: unlink, isPending: isUnlinking } = useUnlinkTelegram()

  if (isError) {
    throw error
  }

  const busy = loaded === null || isSaving
  const telegram = settings?.telegram
  const email = settings?.email

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    touchedRef.current = true
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    await save(
      {
        email_from_name: draft.email_from_name.trim(),
        email_reply_to: draft.email_reply_to.trim(),
      },
      {
        onSuccess: (response) => {
          touchedRef.current = false
          setDraft({
            email_from_name: response.settings.email.from_name ?? "",
            email_reply_to: response.settings.email.reply_to ?? "",
          })
          toast.success(t("notificationSettings.saved"))
        },
        onError: (saveError) => toast.error(saveError.message),
      }
    )
  }

  const handleConnect = async () => {
    await createLink(undefined, {
      onSuccess: (response) => setDeepLink(response.deep_link),
      onError: (linkError) => toast.error(linkError.message),
    })
  }

  const handleTest = async () => {
    await sendTest(undefined, {
      onSuccess: () => toast.success(t("notificationSettings.telegram.testSent")),
      onError: (testError) => toast.error(testError.message),
    })
  }

  const handleUnlink = async () => {
    await unlink(undefined, {
      onSuccess: () => {
        setDeepLink(null)
        toast.success(t("notificationSettings.telegram.unlinked"))
      },
      onError: (unlinkError) => toast.error(unlinkError.message),
    })
  }

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading>{t("notificationSettings.title")}</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            {t("notificationSettings.subtitle")}
          </Text>
        </div>

        {/* Письмо покупателю */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-y-5 px-6 py-6">
          <div className="flex items-center justify-between">
            <Text weight="plus">{t("notificationSettings.email.title")}</Text>
            {loaded ? (
              <Badge
                size="2xsmall"
                color={email?.configured ? "green" : "orange"}
                data-testid="email-state"
              >
                {email?.configured
                  ? t("notificationSettings.email.on")
                  : t("notificationSettings.email.off")}
              </Badge>
            ) : null}
          </div>

          <Text size="small" className="text-ui-fg-subtle">
            {email?.configured
              ? t("notificationSettings.email.hint", {
                  url: shop?.storefront_url ?? "",
                })
              : t("notificationSettings.email.offHint")}
          </Text>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="email_from_name">
                {t("notificationSettings.email.fromName")}
              </Label>
              <Input
                id="email_from_name"
                name="email_from_name"
                autoComplete="off"
                value={draft.email_from_name}
                disabled={busy}
                onChange={(event) => update("email_from_name", event.target.value)}
                placeholder={
                  loaded === null ? t("notificationSettings.loading") : (shop?.name ?? "")
                }
              />
              <Text size="xsmall" className="text-ui-fg-subtle">
                {t("notificationSettings.email.fromNameHint", {
                  name: email?.effective_from_name ?? shop?.name ?? "",
                })}
              </Text>
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="email_reply_to">
                {t("notificationSettings.email.replyTo")}
              </Label>
              <Input
                id="email_reply_to"
                name="email_reply_to"
                type="email"
                autoComplete="off"
                value={draft.email_reply_to}
                disabled={busy}
                onChange={(event) => update("email_reply_to", event.target.value)}
                placeholder={
                  loaded === null ? t("notificationSettings.loading") : "shop@example.com"
                }
              />
              <Text size="xsmall" className="text-ui-fg-subtle">
                {t("notificationSettings.email.replyToHint")}
              </Text>
            </div>
          </div>

          <LastDelivery last={email?.last} />

          <div>
            <Button type="submit" size="small" isLoading={isSaving} disabled={busy}>
              {t("notificationSettings.save")}
            </Button>
          </div>
        </form>

        {/* Telegram владельцу */}
        <div className="flex flex-col gap-y-5 px-6 py-6">
          <div className="flex items-center justify-between">
            <Text weight="plus">{t("notificationSettings.telegram.title")}</Text>
            {loaded ? (
              <Badge
                size="2xsmall"
                color={telegram?.connected ? "green" : "grey"}
                data-testid="telegram-state"
              >
                {telegram?.connected
                  ? t("notificationSettings.telegram.connected")
                  : t("notificationSettings.telegram.notConnected")}
              </Badge>
            ) : null}
          </div>

          {telegram?.connected ? (
            <Text size="small" className="text-ui-fg-subtle" data-testid="telegram-chat">
              {t("notificationSettings.telegram.chat", {
                chat: telegram.chat_title || t("notificationSettings.telegram.chatUnnamed"),
              })}
            </Text>
          ) : (
            <Text size="small" className="text-ui-fg-subtle">
              {telegram?.configured === false
                ? t("notificationSettings.telegram.offHint")
                : t("notificationSettings.telegram.hint")}
            </Text>
          )}

          {deepLink ? (
            <div className="flex flex-col gap-y-2">
              <Text size="small">{t("notificationSettings.telegram.linkReady")}</Text>
              <a
                href={deepLink}
                target="_blank"
                rel="noreferrer"
                className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small-plus"
                data-testid="telegram-deep-link"
              >
                {deepLink}
              </a>
            </div>
          ) : null}

          <LastDelivery last={telegram?.last} />

          <div className="flex items-center gap-x-2">
            <Button
              type="button"
              size="small"
              variant={telegram?.connected ? "secondary" : "primary"}
              isLoading={isLinking}
              disabled={loaded === null || isLinking}
              onClick={handleConnect}
              data-testid="telegram-connect"
            >
              {telegram?.connected
                ? t("notificationSettings.telegram.reconnect")
                : t("notificationSettings.telegram.connect")}
            </Button>
            <Button
              type="button"
              size="small"
              variant="secondary"
              isLoading={isTesting}
              disabled={loaded === null || !telegram?.connected || isTesting}
              onClick={handleTest}
              data-testid="telegram-test"
            >
              {t("notificationSettings.telegram.test")}
            </Button>
            {telegram?.connected ? (
              <Button
                type="button"
                size="small"
                variant="danger"
                isLoading={isUnlinking}
                disabled={isUnlinking}
                onClick={handleUnlink}
                data-testid="telegram-unlink"
              >
                {t("notificationSettings.telegram.unlink")}
              </Button>
            ) : null}
          </div>
        </div>
      </Container>
    </SingleColumnPage>
  )
}
