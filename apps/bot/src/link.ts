/**
 * link.ts — привязка чата Telegram к магазину (t08-order-notifications).
 *
 * Владелец магазина жмёт в панели ссылку `https://t.me/upreadystore_bot?start=lk_…`.
 * Telegram отдаёт боту код как payload команды `/start`. Бот сам не знает, чей
 * это код: код выпустил бэкенд, он же хранит магазины. Поэтому бот только
 * пересылает пару «код + chat_id» на `POST /telegram/link` под общим секретом,
 * а текст ответа берёт из ответа бэкенда — чтобы формулировка для владельца
 * жила в одном месте, а не в двух.
 *
 * Тарифные payload'ы (`plan_1`…`plan_3`) сюда не попадают: их форма другая.
 */

import type { TelegramChat } from "./telegram.ts";

/** Тот же формат, что минтит `src/tenant-notifications/link-code.ts` на бэкенде. */
const LINK_PAYLOAD = /^lk_[A-Za-z0-9_-]{8,60}$/;

export function isLinkPayload(payload: string): boolean {
  return LINK_PAYLOAD.test(payload.trim());
}

export interface LinkConfig {
  /** Адрес бэкенда: на хосте — внутренний `http://mt-backend:9000`, локально — стенд. */
  readonly backendUrl: string;
  /** Общий секрет `TELEGRAM_LINK_SECRET`: тот же, что у бэкенда. */
  readonly secret: string;
}

export function readLinkConfig(env: NodeJS.ProcessEnv): LinkConfig | null {
  const backendUrl = (env["UPREADY_BACKEND_URL"] ?? "").trim();
  const secret = (env["TELEGRAM_LINK_SECRET"] ?? "").trim();
  if (backendUrl === "" || secret === "") return null;
  return { backendUrl: backendUrl.replace(/\/+$/, ""), secret };
}

/** Как назвать чат в панели: у группы это title, у лички — имя человека. */
export function chatTitle(chat: TelegramChat, from?: { first_name?: string; last_name?: string }): string {
  const parts = [chat.title, from?.first_name, from?.last_name, chat.username ? `@${chat.username}` : undefined];
  return parts.filter((part) => typeof part === "string" && part.trim() !== "").join(" ").trim();
}

export interface LinkOutcome {
  /** Что напечатать владельцу. Текст приходит с бэкенда — локаль решает он. */
  readonly text: string;
  readonly status: "linked" | "unknown" | "expired" | "error";
}

/**
 * Один вызов бэкенда. Сеть или 5xx — это не «код плохой», и владельцу так и
 * говорится: молчание было бы худшим исходом (правило 20a).
 */
export async function redeemLinkCode(
  config: LinkConfig,
  code: string,
  chat: TelegramChat,
  from?: { first_name?: string; last_name?: string; language_code?: string },
): Promise<LinkOutcome> {
  let response: Response;
  try {
    response = await fetch(`${config.backendUrl}/telegram/link`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-link-secret": config.secret,
      },
      body: JSON.stringify({
        code,
        chat_id: String(chat.id),
        chat_title: chatTitle(chat, from),
        language_code: from?.language_code ?? "",
      }),
    });
  } catch (error) {
    return {
      status: "error",
      text: `Не получилось связаться с платформой: ${error instanceof Error ? error.message : String(error)}. Попробуйте ещё раз через минуту.`,
    };
  }

  let payload: { status?: string; message?: string } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    payload = {};
  }

  const status = payload.status;
  if (status === "linked" || status === "unknown" || status === "expired") {
    return {
      status,
      text: payload.message ?? "Готово.",
    };
  }

  return {
    status: "error",
    text: `Платформа ответила ошибкой (${response.status}). Получите новый код в панели, раздел «Уведомления».`,
  };
}
