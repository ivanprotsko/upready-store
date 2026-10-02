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

// The shop's own Telegram bot (t-2026-10-02-telegram-auth), for buyer sign-in
// (Login Widget + Mini App). ONE query: unlike ApiShip/Ozon there is no
// separate "ask the vendor" probe here — `PUT` itself calls Telegram's
// `getMe` with the typed token before the row is written, so the save
// response already carries the verdict (accepted, or a 400 naming why not).

export type MaskedSecret = { set: boolean; last4: string | null }

export type TelegramBotSettings = {
  id: string
  is_enabled: boolean
  username: string
  token: MaskedSecret
}

export type TelegramBotResponse = {
  provider: "telegram"
  label: string
  /** `null` until the owner saves a bot. */
  settings: TelegramBotSettings | null
}

export type PutTelegramBotBody = { username: string; token: string }

const TELEGRAM_BOT_QUERY_KEY = "tenant-telegram-bot" as const
export const telegramBotQueryKeys = queryKeysFactory(TELEGRAM_BOT_QUERY_KEY)

export const useTelegramBot = (
  options?: Omit<
    UseQueryOptions<TelegramBotResponse, FetchError, TelegramBotResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: telegramBotQueryKeys.details(),
    queryFn: () => sdk.client.fetch<TelegramBotResponse>("/tenants/telegram-bot"),
    ...options,
  })

  return { telegramBot: data, ...rest }
}

export const useSaveTelegramBot = (
  options?: UseMutationOptions<TelegramBotResponse, FetchError, PutTelegramBotBody>
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<TelegramBotResponse>("/tenants/telegram-bot", {
        method: "PUT",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: telegramBotQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useDeleteTelegramBot = (
  options?: UseMutationOptions<TelegramBotResponse, FetchError, void>
) => {
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<TelegramBotResponse>("/tenants/telegram-bot", { method: "DELETE" }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: telegramBotQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
