/**
 * route.ts — апдейт Telegram → что боту делать. Чистая функция: в тесте
 * апдейт собирается литералом, сеть не нужна.
 */

import type { TelegramUpdate } from "./telegram.ts";

export type Action =
  | {
      readonly kind: "reply";
      readonly chatId: number;
      /** Payload для ядра: `plan_1|plan_2|plan_3` либо пустая строка — меню. */
      readonly payload: string;
      readonly source: "command" | "text" | "callback";
      readonly callbackQueryId?: string;
    }
  | { readonly kind: "ignore"; readonly reason: string };

/**
 * `/start plan_2`, `/start@upreadystore_bot plan_2` и просто `/start` — одна
 * форма: команда, дальше payload. Пустой payload — это меню, а не тариф.
 */
export function payloadFromStart(text: string): string | null {
  const match = /^\/start(?:@[A-Za-z0-9_]+)?(?:\s+(.*))?$/s.exec(text.trim());
  if (match === null) return null;
  return (match[1] ?? "").trim();
}

export function routeUpdate(update: TelegramUpdate): Action {
  const callback = update.callback_query;
  if (callback !== undefined) {
    const chatId = callback.message?.chat.id ?? callback.from.id;
    return {
      kind: "reply",
      chatId,
      payload: (callback.data ?? "").trim(),
      source: "callback",
      callbackQueryId: callback.id,
    };
  }

  const message = update.message;
  if (message === undefined) return { kind: "ignore", reason: "no message" };
  const text = message.text;
  if (text === undefined) return { kind: "ignore", reason: "message without text" };

  const started = payloadFromStart(text);
  if (started !== null) {
    return { kind: "reply", chatId: message.chat.id, payload: started, source: "command" };
  }
  // Любой другой текст — это человек, который что-то напечатал: ведём в меню,
  // а не молчим.
  return { kind: "reply", chatId: message.chat.id, payload: "", source: "text" };
}
