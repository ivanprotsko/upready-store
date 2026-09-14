import { randomBytes } from "node:crypto";

/**
 * The one-time code that binds a Telegram chat to a shop
 * (t08-order-notifications).
 *
 * The owner presses `https://t.me/<bot>?start=<code>` in the panel, Telegram
 * delivers the code to the bot as the `/start` payload, and the bot hands it
 * back to this backend, which is the only side that knows which shop minted it.
 * So the code is the whole proof of ownership, and it is treated like one: 96
 * bits of randomness, single use, and dead after fifteen minutes.
 *
 * The `lk_` prefix is what tells the bot a `/start` payload is a link code and
 * not a pricing plan (`plan_1`, `apps/bot/src/plans.ts`).
 */

export const LINK_CODE_PREFIX = "lk_";

/** Fifteen minutes: long enough to switch to Telegram, short enough that a leaked link is stale. */
export const LINK_CODE_TTL_MS = 15 * 60 * 1000;

export const generateLinkCode = (): string =>
  `${LINK_CODE_PREFIX}${randomBytes(12).toString("base64url")}`;

/** Telegram's own limit on a `start` payload is 64 characters of `[A-Za-z0-9_-]`. */
export const isLinkCode = (value: string): boolean =>
  new RegExp(`^${LINK_CODE_PREFIX}[A-Za-z0-9_-]{8,60}$`).test(value);

export const expiresAtFrom = (now: Date): Date => new Date(now.getTime() + LINK_CODE_TTL_MS);

/**
 * A code is usable while it exists and its deadline has not passed. A row with
 * a code but no deadline is treated as expired rather than as eternal: the
 * failure of a write must not become a permanent skeleton key.
 */
export const isUsable = (
  row: { link_code?: string | null; link_code_expires_at?: Date | string | null },
  now: Date,
): boolean => {
  if (!row.link_code) {
    return false;
  }

  const expiresAt = row.link_code_expires_at ? new Date(row.link_code_expires_at) : null;

  if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
    return false;
  }

  return expiresAt.getTime() > now.getTime();
};
