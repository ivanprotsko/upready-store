import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { decryptJson, keyFromEnv, maskSecret, type MaskedSecret } from "./crypto";

/**
 * The Telegram bot credentials of ONE shop: the plaintext shape of
 * `tenant_integration_secret.payload` for `provider = "telegram"`
 * (t-2026-10-02-telegram-auth).
 *
 * Same mechanism as every other slot: AES-256-GCM under the platform's
 * `INTEGRATION_ENCRYPTION_KEY`, never plaintext, and no route ever returns the
 * token. `username` is public by construction (it is what the Login Widget's
 * `data-telegram-login` attribute and the Mini App deep link both show the
 * buyer already), so it is the one field this module is happy to hand back in
 * full; `token` is masked the same way every other secret field is.
 */
export type TelegramBotCredentials = {
  username: string;
  token: string;
};

export type ResolvedTelegramBotSecret = {
  id: string;
  tenant_id: string;
  is_enabled: boolean;
  credentials: TelegramBotCredentials;
};

export type MaskedTelegramBotSettings = {
  id: string;
  provider: "telegram";
  is_enabled: boolean;
  username: string;
  token: MaskedSecret;
};

export const maskTelegramBotSettings = (
  row: ResolvedTelegramBotSecret,
): MaskedTelegramBotSettings => ({
  id: row.id,
  provider: "telegram",
  is_enabled: row.is_enabled,
  username: row.credentials.username,
  token: maskSecret(row.credentials.token),
});

/**
 * The shop's Telegram bot row, read straight off the shared Postgres
 * connection for the same reason `readOzonSecret`/`readPochtaSecret` do.
 *
 * Returns `null` when there is no row, it is soft-deleted, or it is disabled.
 * The caller (the auth provider, the tenant-panel route) decides what "no bot"
 * means for it; this reader never guesses.
 */
export const readTelegramBotSecret = async (
  pg: Knex,
  tenantId: string,
  options: { includeDisabled?: boolean } = {},
): Promise<ResolvedTelegramBotSecret | null> => {
  const row = (await pg("tenant_integration_secret")
    .select("id", "tenant_id", "payload", "is_enabled")
    .where({ tenant_id: tenantId, provider: "telegram" })
    .whereNull("deleted_at")
    .first()) as
    | { id: string; tenant_id: string; payload: string; is_enabled: boolean }
    | undefined;

  if (!row || (!row.is_enabled && !options.includeDisabled)) {
    return null;
  }

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    is_enabled: row.is_enabled,
    credentials: decryptJson<TelegramBotCredentials>(row.payload, keyFromEnv()),
  };
};

/**
 * `readTelegramBotSecret`, narrowed to a usable bot: a row whose `username`
 * and `token` are both non-empty strings after decryption.
 *
 * This is the `||`-not-`??` guard the chrxnasdmds incident (`b553c540`,
 * `d87bd117`) is the whole reason for: an empty string is falsy and must be
 * treated exactly like a missing value, never passed on to the HMAC step as a
 * "valid" secret. Call this, not `readTelegramBotSecret`, anywhere a bot token
 * is about to key a signature check.
 */
export const readUsableTelegramBot = async (
  pg: Knex,
  tenantId: string,
): Promise<ResolvedTelegramBotSecret | null> => {
  const secret = await readTelegramBotSecret(pg, tenantId);
  if (!secret || !secret.credentials.username || !secret.credentials.token) {
    return null;
  }
  return secret;
};

/**
 * The bot's numeric id, the part of its token before the colon
 * (t-cherk-telegram-login). The storefront's own «Войти через Телеграм» button
 * opens Telegram's popup with `Telegram.Login.auth({ bot_id })`, and Telegram
 * puts the same id in that popup's URL, so it is as public as the username.
 * Nothing after the colon ever leaves this function.
 */
export const botIdFromToken = (token: string): number | null => {
  const match = /^(\d+):/.exec(token.trim());
  const id = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};
