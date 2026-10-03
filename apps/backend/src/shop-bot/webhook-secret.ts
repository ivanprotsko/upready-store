import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The shop bot's webhook secret (t-cherk-23). Telegram echoes the
 * `secret_token` given to `setWebhook` in the `X-Telegram-Bot-Api-Secret-Token`
 * header of every update, so a request without the right header did not come
 * from Telegram for this shop's bot.
 */

export const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token";

/** 64 hex chars: inside Telegram's allowed `A-Za-z0-9_-`, 1..256. */
export const generateWebhookSecret = (): string => randomBytes(32).toString("hex");

/** Constant-time; an empty expected secret never matches (the chrxnasdmds `b553c540` lesson). */
export const webhookSecretMatches = (
  expected: string | null | undefined,
  received: string | string[] | null | undefined,
): boolean => {
  const value = Array.isArray(received) ? received[0] : received;
  if (!expected || !value) {
    return false;
  }
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(value, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * The code in the owner's `/start mgr_<code>` deep link that registers their
 * chat as the `/manager` destination. Derived from the webhook secret, so it
 * changes on every re-provision and is never stored on its own.
 */
export const managerLinkCode = (webhookSecret: string): string =>
  createHash("sha256").update(`${webhookSecret}:manager`, "utf8").digest("hex").slice(0, 16);
