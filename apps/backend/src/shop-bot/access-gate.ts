import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Closed mode for the shop bot (Ivan, 2026-10-04: «спрятать под пароль бота»).
 *
 * While a shop is being prepared for its owner, its bot is still a public
 * Telegram username anyone can find and press «Start» on — Telegram has no
 * private-bot switch. So the deployment can demand a password: a chat that has
 * not typed it sees only the prompt, never the catalog, the cart or the
 * orders. The owner's own `/start mgr_<code>` deep link counts as the key too.
 *
 * The password itself never lives anywhere: the env carries its SHA-256 hex
 * (`SHOP_BOT_ACCESS_PASSWORD_SHA256`), the compare is constant-time, and the
 * "already let in" fact is remembered per Telegram identity per shop
 * (`ShopPort.hasBotAccess` / `grantBotAccess`), so one deployment restart does
 * not lock everyone out again. An empty or malformed value means open mode —
 * every shop on the deployment behaves as before this file existed.
 */

export const ACCESS_PASSWORD_HASH_ENV = "SHOP_BOT_ACCESS_PASSWORD_SHA256";

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** The configured hash, lower-cased, or null when the deployment runs in open mode. */
export function accessPasswordHashFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = (env[ACCESS_PASSWORD_HASH_ENV] ?? "").trim().toLowerCase();
  return SHA256_HEX.test(raw) ? raw : null;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Constant-time: a wrong attempt costs the same as a right one. */
export function passwordMatches(expectedHash: string, attempt: string): boolean {
  const actual = Buffer.from(sha256Hex(attempt.trim()), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
