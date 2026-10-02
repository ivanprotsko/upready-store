import "server-only"

import { sdk } from "@lib/config"

export type TelegramBot = { username: string }

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
    return bot?.username ? { username: bot.username } : null
  } catch (error) {
    console.error("getTelegramBot: /store/telegram-bot did not answer; no Telegram sign-in", error)
    return null
  }
}
