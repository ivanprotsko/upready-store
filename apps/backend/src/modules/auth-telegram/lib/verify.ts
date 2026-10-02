import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signature verification for Telegram's two buyer-facing sign-in surfaces,
 * ported from chrxnasdmds `3e0163d8` (`packages/auth-core/src/init-data.ts`):
 *
 * - The Login Widget (`/account`, checkout's «Войти») posts a flat object
 *   (`id`, `first_name`, …, `auth_date`, `hash`), signed with
 *   `secret = SHA256(botToken)`.
 * - The Mini App's `Telegram.WebApp.initData` is a query string whose `user`
 *   field is itself a JSON blob, signed with
 *   `secret = HMAC_SHA256("WebAppData", botToken)`.
 *
 * Both build the same `dataCheckString` (every field but `hash`/`signature`,
 * sorted by key, joined with `\n`) and both are rejected if `auth_date` is
 * outside the freshness bound — a captured payload has a shelf life, not a
 * single use, so the bound is what retires it.
 *
 * `timingSafeEqual`, never `===`, because a hash comparison is exactly the
 * kind of check a timing side-channel can shave bits off of.
 */

export type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
};

export type VerifyFailureReason =
  | "missing_input"
  | "no_hash"
  | "bad_hash"
  | "expired"
  | "bad_user"
  | "parse_error";

export type VerifyResult =
  | { ok: true; user: TelegramUser; authDate: number }
  | { ok: false; reason: VerifyFailureReason };

export type VerifyOptions = {
  /** `auth_date` must be within this many seconds of now. 0 disables the check. Default 86400 (24h). */
  maxAgeSec?: number;
  /** Only for tests: pin "now" instead of reading the clock. */
  now?: () => number;
};

const DEFAULT_MAX_AGE_SEC = 86_400;

const dataCheckString = (params: Record<string, string>): string =>
  Object.keys(params)
    .filter((key) => key !== "hash" && key !== "signature")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("\n");

const hexEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
};

const checkFreshness = (
  authDate: number,
  options: VerifyOptions,
): VerifyFailureReason | null => {
  const maxAgeSec = options.maxAgeSec ?? DEFAULT_MAX_AGE_SEC;
  if (!maxAgeSec) {
    return null;
  }
  const now = (options.now ?? (() => Date.now()))();
  const ageSec = Math.abs(now / 1000 - authDate);
  return ageSec > maxAgeSec ? "expired" : null;
};

const parseUser = (raw: string | undefined): TelegramUser | null => {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as { id?: unknown }).id !== "number"
    ) {
      return null;
    }
    return parsed as TelegramUser;
  } catch {
    return null;
  }
};

/**
 * The Login Widget's flat payload. `botToken` is the shop's own bot token,
 * resolved per tenant by the caller — this function never reads one off the
 * environment.
 */
export const verifyLoginWidget = (
  data: Record<string, string> | null | undefined,
  botToken: string,
  options: VerifyOptions = {},
): VerifyResult => {
  if (!data || !botToken) {
    return { ok: false, reason: "missing_input" };
  }

  const hash = data.hash;
  if (!hash) {
    return { ok: false, reason: "no_hash" };
  }

  const secret = createHash("sha256").update(botToken, "utf8").digest();
  const computed = createHmac("sha256", secret)
    .update(dataCheckString(data))
    .digest("hex");

  if (!hexEqual(computed, hash)) {
    return { ok: false, reason: "bad_hash" };
  }

  const authDate = Number(data.auth_date);
  if (!Number.isFinite(authDate)) {
    return { ok: false, reason: "bad_user" };
  }

  const freshnessFailure = checkFreshness(authDate, options);
  if (freshnessFailure) {
    return { ok: false, reason: freshnessFailure };
  }

  const id = Number(data.id);
  if (!Number.isFinite(id)) {
    return { ok: false, reason: "bad_user" };
  }

  return {
    ok: true,
    authDate,
    user: {
      id,
      first_name: data.first_name,
      last_name: data.last_name,
      username: data.username,
      photo_url: data.photo_url,
    },
  };
};

/**
 * The Mini App's `initData` query string (`window.Telegram.WebApp.initData`).
 */
export const verifyInitData = (
  initData: string | null | undefined,
  botToken: string,
  options: VerifyOptions = {},
): VerifyResult => {
  if (!initData || !botToken) {
    return { ok: false, reason: "missing_input" };
  }

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: "parse_error" };
  }

  const hash = params.get("hash");
  if (!hash) {
    return { ok: false, reason: "no_hash" };
  }

  const fields: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    fields[key] = value;
  }

  const secret = createHmac("sha256", "WebAppData").update(botToken, "utf8").digest();
  const computed = createHmac("sha256", secret)
    .update(dataCheckString(fields))
    .digest("hex");

  if (!hexEqual(computed, hash)) {
    return { ok: false, reason: "bad_hash" };
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate)) {
    return { ok: false, reason: "bad_user" };
  }

  const freshnessFailure = checkFreshness(authDate, options);
  if (freshnessFailure) {
    return { ok: false, reason: freshnessFailure };
  }

  const user = parseUser(params.get("user") ?? undefined);
  if (!user) {
    return { ok: false, reason: "bad_user" };
  }

  return { ok: true, authDate, user };
};
