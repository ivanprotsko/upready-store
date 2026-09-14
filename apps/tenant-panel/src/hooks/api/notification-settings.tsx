import { FetchError } from "@medusajs/js-sdk"
import {
  QueryKey,
  UseMutationOptions,
  UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query"
import { sdk } from "../../lib/client"
import { queryClient } from "../../lib/query-client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// Уведомления о заказе (t08-order-notifications): кто узнаёт о новом заказе —
// покупатель письмом, владелец сообщением в Telegram. Свой хук панели, у Admin
// аналога нет: там один магазин, и всё это стоит в конфиге приложения.

export type DeliveryStatus = {
  status: "ok" | "failed" | null
  at: string | null
  error: string | null
  order: string | null
}

export type NotificationSettings = {
  email: {
    from_name: string | null
    reply_to: string | null
    effective_from_name: string
    /** false — у платформы не настроен SMTP, письма не уходят вовсе */
    configured: boolean
    last: DeliveryStatus
  }
  telegram: {
    connected: boolean
    chat_title: string | null
    linked_at: string | null
    pending_link: boolean
    configured: boolean
    bot_username: string
    last: DeliveryStatus
  }
}

export type NotificationSettingsResponse = {
  settings: NotificationSettings
  shop: { name: string; storefront_url: string }
}

export type PutNotificationSettingsBody = {
  email_from_name?: string
  email_reply_to?: string
}

export type TelegramLinkCode = {
  deep_link: string
  expires_at: string
  ttl_seconds: number
}

const NOTIFICATION_SETTINGS_QUERY_KEY = "notification-settings" as const
export const notificationSettingsQueryKeys = queryKeysFactory(NOTIFICATION_SETTINGS_QUERY_KEY)

const invalidate = () =>
  queryClient.invalidateQueries({ queryKey: notificationSettingsQueryKeys.all })

export const useNotificationSettings = (
  options?: Omit<
    UseQueryOptions<
      NotificationSettingsResponse,
      FetchError,
      NotificationSettingsResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: notificationSettingsQueryKeys.details(),
    queryFn: () =>
      sdk.client.fetch<NotificationSettingsResponse>("/tenants/notification-settings"),
    ...options,
  })

  return { ...data, ...rest }
}

export const useUpdateNotificationSettings = (
  options?: UseMutationOptions<
    NotificationSettingsResponse,
    FetchError,
    PutNotificationSettingsBody
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<NotificationSettingsResponse>("/tenants/notification-settings", {
        method: "PUT",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      invalidate()
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

/** Выпускает одноразовый код и отдаёт ссылку, которую владелец открывает в Telegram. */
export const useCreateTelegramLink = (
  options?: UseMutationOptions<TelegramLinkCode, FetchError, void>
) => {
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<TelegramLinkCode>("/tenants/notification-settings/telegram/code", {
        method: "POST",
      }),
    onSuccess: (data, variables, context) => {
      invalidate()
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

/** Шлёт настоящее сообщение в привязанный чат: только оно доказывает, что канал работает. */
export const useTestTelegram = (
  options?: UseMutationOptions<{ sent: boolean; message_id: number }, FetchError, void>
) => {
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<{ sent: boolean; message_id: number }>(
        "/tenants/notification-settings/telegram/test",
        { method: "POST" }
      ),
    onSuccess: (data, variables, context) => {
      invalidate()
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useUnlinkTelegram = (
  options?: UseMutationOptions<NotificationSettingsResponse, FetchError, void>
) => {
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<NotificationSettingsResponse>(
        "/tenants/notification-settings/telegram",
        { method: "DELETE" }
      ),
    onSuccess: (data, variables, context) => {
      invalidate()
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
