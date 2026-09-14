/**
 * telegram.ts — тонкий клиент Bot API поверх глобального `fetch`.
 * Зависимостей нет: Node 22.18+/24 исполняет TypeScript сам, а HTTP у него
 * свой. Меньше кода — меньше того, что нужно чинить после смены версии.
 */

import type { OutgoingMessage } from "./message.ts";

/** База API. Переопределяется переменной — прогон с захватом исходящих
 *  направляют в локальный приёмник, не трогая остальной код. */
const API_BASE = (process.env["TELEGRAM_API_BASE"] ?? "https://api.telegram.org").replace(
  /\/+$/,
  "",
);

export interface TelegramChat {
  readonly id: number;
  readonly type: string;
  readonly username?: string;
}

export interface TelegramMessage {
  readonly message_id: number;
  readonly chat: TelegramChat;
  readonly text?: string;
}

export interface TelegramUpdate {
  readonly update_id: number;
  readonly message?: TelegramMessage;
  readonly callback_query?: {
    readonly id: string;
    readonly data?: string;
    readonly message?: TelegramMessage;
    readonly from: { readonly id: number };
  };
}

export class TelegramError extends Error {
  // Поля объявлены явно: параметры-свойства снятием типов не выражаются, и
  // Node такой файл не исполнит вовсе (`erasableSyntaxOnly` ловит это на tsc).
  readonly method: string;
  readonly code: number;
  readonly description: string;

  constructor(method: string, code: number, description: string) {
    super(`${method}: ${code} ${description}`);
    this.name = "TelegramError";
    this.method = method;
    this.code = code;
    this.description = description;
  }
}

async function call<T>(
  token: string,
  method: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
  const payload = (await response.json()) as {
    ok: boolean;
    result?: T;
    error_code?: number;
    description?: string;
  };
  if (!payload.ok) {
    throw new TelegramError(method, payload.error_code ?? response.status, payload.description ?? "");
  }
  return payload.result as T;
}

export interface BotIdentity {
  readonly id: number;
  readonly username: string;
  readonly first_name: string;
}

export function getMe(token: string): Promise<BotIdentity> {
  return call<BotIdentity>(token, "getMe", {});
}

export function getUpdates(
  token: string,
  offset: number,
  timeoutSeconds: number,
  signal?: AbortSignal,
): Promise<TelegramUpdate[]> {
  return call<TelegramUpdate[]>(
    token,
    "getUpdates",
    { offset, timeout: timeoutSeconds, allowed_updates: ["message", "callback_query"] },
    signal,
  );
}

export function sendMessage(
  token: string,
  chatId: number,
  message: OutgoingMessage,
): Promise<TelegramMessage> {
  return call<TelegramMessage>(token, "sendMessage", { chat_id: chatId, ...message });
}

export function answerCallbackQuery(token: string, callbackQueryId: string): Promise<boolean> {
  return call<boolean>(token, "answerCallbackQuery", { callback_query_id: callbackQueryId });
}
