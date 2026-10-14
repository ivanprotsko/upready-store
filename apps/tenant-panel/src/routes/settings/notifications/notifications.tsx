import { ChatBubbleLeftRight, Link as LinkIcon, Trash } from "@medusajs/icons"
import { Button, toast, usePrompt } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import {
  SettingsDetail,
  type SettingsRow,
  type SettingsSection,
} from "../../../components/settings"
import {
  type DeliveryStatus,
  useNotificationSettings,
  useTestTelegram,
  useUnlinkTelegram,
} from "../../../hooks/api/notification-settings"
import { useDate } from "../../../hooks/use-date"

// «Уведомления» (t08-order-notifications): кто узнаёт о новом заказе.
// Покупатель получает письмо, владелец — сообщение в Telegram.
//
// Последняя доставка каждого канала показана здесь же: молчание — не
// результат (правило 20a), и владелец должен видеть неудачу, не заглядывая в лог.
//
// t-2026-10-14-01 (panel redesign, G1): the page only reads. Two sections of
// equal rank, the setting's name in the breadcrumb (E11). The letter is edited
// in the `edit` drawer; Telegram connects in the `telegram-connect` drawer, and
// «Проверить» and «Отключить» (with a prompt naming the chat) sit in the
// section's «…» (rule 21).

const TELEGRAM_CONNECT = "telegram-connect"

// The backend surfaces a raw provider exception as `last.error`
// ("Could not find a notification provider for channel: email for
// notification id noti_…"). A shop owner has no use for that sentence, and
// the one failure this platform actually produces today — no mail server
// configured — has a friendly explanation. Map that one recognized cause to
// it; anything else stays the «не доставлено» badge alone rather than leaking
// a stack-shaped string onto the screen.
const isNoProvider = (rawError: string | null | undefined) =>
  !!rawError && /notification provider/i.test(rawError)

export const NotificationSettings = () => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()
  const prompt = usePrompt()
  const { settings, shop, isPending, isError, error } = useNotificationSettings()

  const { mutateAsync: sendTest, isPending: isTesting } = useTestTelegram()
  const { mutateAsync: unlink, isPending: isUnlinking } = useUnlinkTelegram()

  if (isError) {
    throw error
  }

  const email = settings?.email
  const telegram = settings?.telegram
  const chat = telegram?.chat_title || t("notificationSettings.telegram.chatUnnamed")

  const deliveryRow = (id: string, last: DeliveryStatus | undefined): SettingsRow => {
    const label = t("notificationSettings.last.label")

    if (!last?.status) {
      return { id, label, hint: t("notificationSettings.last.never") }
    }

    const when = last.at ? getFullDate({ date: last.at, includeTime: true }) : ""
    const value = last.order
      ? t("notificationSettings.last.whenOrder", { when, order: last.order })
      : when

    if (last.status === "ok") {
      return {
        id,
        label,
        value,
        status: { color: "green", label: t("notificationSettings.last.ok") },
      }
    }

    return {
      id,
      label,
      value,
      status: { color: "red", label: t("notificationSettings.last.failed") },
      hint: isNoProvider(last.error) ? t("notificationSettings.noProviderError") : undefined,
    }
  }

  const handleTest = async () => {
    await sendTest(undefined, {
      onSuccess: () => toast.success(t("notificationSettings.telegram.testSent")),
      onError: (testError) => toast.error(testError.message),
    })
  }

  const handleUnlink = async () => {
    const confirmed = await prompt({
      title: t("notificationSettings.telegram.unlinkPrompt.title"),
      description: t("notificationSettings.telegram.unlinkPrompt.description", { chat }),
      confirmText: t("notificationSettings.telegram.unlink"),
      cancelText: t("actions.cancel"),
    })

    if (!confirmed) {
      return
    }

    await unlink(undefined, {
      onSuccess: () => toast.success(t("notificationSettings.telegram.unlinked")),
      onError: (unlinkError) => toast.error(unlinkError.message),
    })
  }

  const emailSection: SettingsSection = {
    id: "email",
    title: t("notificationSettings.email.title"),
    description: email?.configured
      ? t("notificationSettings.email.hint", { url: shop?.storefront_url ?? "" })
      : t("notificationSettings.email.offHint"),
    status: email?.configured
      ? { color: "green", label: t("notificationSettings.email.on") }
      : { color: "orange", label: t("notificationSettings.email.off") },
    editTo: "edit",
    rows: [
      {
        id: "from_name",
        label: t("notificationSettings.email.fromName"),
        value: email?.from_name || null,
        hint: email?.from_name
          ? t("notificationSettings.email.fromNameRowHint")
          : t("notificationSettings.email.fromNameEmpty", {
              name: email?.effective_from_name || shop?.name || "",
            }),
      },
      {
        id: "reply_to",
        label: t("notificationSettings.email.replyTo"),
        value: email?.reply_to || null,
        hint: email?.reply_to ? undefined : t("notificationSettings.email.replyToEmpty"),
      },
      deliveryRow("email_last", email?.last),
    ],
  }

  const telegramActions = (): Pick<SettingsSection, "description" | "actions" | "action"> => {
    if (telegram?.connected) {
      return {
        description: t("notificationSettings.telegram.description"),
        actions: [
          {
            actions: [
              {
                label: t("notificationSettings.telegram.test"),
                icon: <ChatBubbleLeftRight />,
                disabled: isTesting,
                onClick: handleTest,
              },
              {
                label: t("notificationSettings.telegram.reconnect"),
                icon: <LinkIcon />,
                to: TELEGRAM_CONNECT,
              },
            ],
          },
          {
            actions: [
              {
                label: t("notificationSettings.telegram.unlink"),
                icon: <Trash />,
                disabled: isUnlinking,
                onClick: handleUnlink,
              },
            ],
          },
        ],
      }
    }

    // Telegram is not enabled on the platform: nothing the owner can press
    // would work, so the subtitle sends them to support and there is no button.
    if (telegram?.configured === false) {
      return { description: t("notificationSettings.telegram.offHint"), actions: [] }
    }

    return {
      description: t("notificationSettings.telegram.hint"),
      actions: [],
      action: (
        <Button size="small" variant="secondary" asChild>
          <Link to={TELEGRAM_CONNECT} data-testid="telegram-connect">
            {t("notificationSettings.telegram.connect")}
          </Link>
        </Button>
      ),
    }
  }

  const telegramSection: SettingsSection = {
    id: "telegram",
    title: t("notificationSettings.telegram.title"),
    status: telegram?.connected
      ? { color: "green", label: t("notificationSettings.telegram.connected") }
      : { color: "grey", label: t("notificationSettings.telegram.notConnected") },
    ...telegramActions(),
    rows: [
      ...(telegram?.connected
        ? [
            { id: "chat", label: t("notificationSettings.telegram.chat"), value: chat },
            {
              id: "linked_at",
              label: t("notificationSettings.telegram.linkedAt"),
              value: telegram.linked_at
                ? getFullDate({ date: telegram.linked_at, includeTime: true })
                : null,
            },
          ]
        : []),
      deliveryRow("telegram_last", telegram?.last),
    ],
  }

  return <SettingsDetail isPending={isPending} sections={[emailSection, telegramSection]} />
}
