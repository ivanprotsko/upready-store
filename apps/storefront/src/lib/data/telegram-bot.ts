import "server-only"

import { sdk } from "@lib/config"

/** `id` is what Telegram's sign-in popup takes (`Telegram.Login.auth({ bot_id })`); both fields are public. */
export type TelegramBot = { username: string; id: number }

/**
 * This shop's Telegram bot for buyer sign-in, or null when it has none — then
 * no Telegram control renders. Not cached: a bot the owner just connected in
 * the panel has to show up on the next page load.
 */
export async function getTelegramBot(): Promise<TelegramBot | null> {
  try {
    const { bot } = await sdk.client.fetch<{ bot: TelegramBot | null }>(`/store/telegram-bot`, {
      cache: "no-store",
    })
    return bot?.username && bot.id ? { username: bot.username, id: bot.id } : null
  } catch (error) {
    console.error("getTelegramBot: /store/telegram-bot did not answer; no Telegram sign-in", error)
    return null
  }
}
