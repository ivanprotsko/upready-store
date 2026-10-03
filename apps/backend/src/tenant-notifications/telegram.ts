/**
 * The platform bot's send side (t08-order-notifications).
 *
 * `@upreadystore_bot` already exists and already runs, as ONE long-polling
 * process on the host (`apps/bot`, container `upreadystore-bot`). Telegram
 * hands `getUpdates` to a single consumer per token, so this backend must never
 * poll: it only calls `sendMessage`, which any number of processes may do at
 * once. That is the whole reason the owner links a chat through the bot and the
 * messages come from here.
 *
 * Why the platform's bot and not the shop's own: storing a bot token per shop
 * is an open question (`q-tg-tenant-token-store`) and deliberately out of this
 * task's scope.
 */

const API_BASE = () =>
  (process.env.TELEGRAM_API_BASE ?? "https://api.telegram.org").replace(/\/+$/, "");

/** The bot's token. Absent means the channel is off, which is a state, not an error. */
export const botToken = (env: NodeJS.ProcessEnv = process.env): string | null => {
  const token = (env.TELEGRAM_BOT_TOKEN ?? "").trim();
  return token === "" ? null : token;
};

/** The @name the deep link is built on. The live bot, unless a stand overrides it. */
export const botUsername = (env: NodeJS.ProcessEnv = process.env): string =>
  (env.TELEGRAM_BOT_USERNAME ?? "upreadystore_bot").trim().replace(/^@/, "");

/** `https://t.me/<bot>?start=<code>` — what the panel shows the owner. */
export const deepLinkFor = (code: string, env: NodeJS.ProcessEnv = process.env): string =>
  `https://t.me/${botUsername(env)}?start=${code}`;

export class TelegramSendError extends Error {
  readonly code: number;
  readonly description: string;
  /** Telegram's own wait, in seconds, from a 429's `parameters.retry_after`. `null` on every other error. */
  readonly retryAfterSec: number | null;

  constructor(code: number, description: string, retryAfterSec: number | null = null) {
    super(`sendMessage: ${code} ${description}`);
    this.name = "TelegramSendError";
    this.code = code;
    this.description = description;
    this.retryAfterSec = retryAfterSec;
  }
}

export type SentMessage = { message_id: number };

/**
 * One `sendMessage`. Plain text on purpose: a shop's own name, a customer's
 * name and an address all reach this string, and with `parse_mode` set any of
 * them could carry an unbalanced `*` or `[` that Telegram rejects — the order
 * would then silently go unannounced because somebody called their product
 * `Dress [new]`.
 */
export const sendTelegramMessage = async (
  token: string,
  chatId: string,
  text: string,
): Promise<SentMessage> => {
  const response = await fetch(`${API_BASE()}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  const payload = (await response.json()) as {
    ok: boolean;
    result?: SentMessage;
    error_code?: number;
    description?: string;
    parameters?: { retry_after?: number };
  };

  if (!payload.ok || !payload.result) {
    throw new TelegramSendError(
      payload.error_code ?? response.status,
      payload.description ?? "unknown error",
      typeof payload.parameters?.retry_after === "number" ? payload.parameters.retry_after : null,
    );
  }

  return payload.result;
};
