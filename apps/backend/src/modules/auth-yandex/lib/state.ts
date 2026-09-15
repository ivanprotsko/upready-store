/**
 * The `state` parameter of the Yandex ID flow: a signed, self-contained token.
 *
 * WHY NOT the framework's own state store. `AuthIdentityProviderService`
 * offers `setState`/`getState`, and `@medusajs/auth-google` uses them: a random
 * key is stored in the CACHE module and read back once. That shape cannot carry
 * this platform's flow, for two measured reasons.
 *
 *   1. One process serves every shop. The callback has to know WHICH storefront
 *      host the buyer came from, in which language, and which page to return
 *      them to, and the Redirect URI cannot carry that: Yandex matches the
 *      redirect_uri against the application's registered list character for
 *      character, so a query string on it breaks the match, and one URI per
 *      locale would mean 36 registrations per host.
 *   2. Without `REDIS_URL` the cache module is in-memory
 *      (`apps/backend/medusa-config.ts` turns Redis on only from its own
 *      variable), so a backend restart between the redirect and the callback
 *      drops the state and the buyer gets «session expired» instead of an
 *      account.
 *
 * So the state IS the payload, signed with HMAC-SHA256 under a secret the
 * backend already holds (`JWT_SECRET`, else `COOKIE_SECRET`). The signature
 * makes it unforgeable; `exp` keeps it short-lived (the Yandex code itself
 * lives 10 minutes, so anything longer is useless to an attacker anyway).
 *
 * WHAT THIS DOES NOT DO. A signed state is not, on its own, a session binding:
 * an attacker can always start a flow of their own and obtain a state that
 * verifies. Binding the flow to the buyer's browser is the storefront's job and
 * is done there — `/api/yandex-login` writes the `nonce` below into an
 * httpOnly cookie and `/api/yandex-callback` refuses a callback whose state
 * carries a different one. The two halves together are the CSRF guard; neither
 * half is one alone.
 */

import crypto from "node:crypto";
import { MedusaError } from "@medusajs/framework/utils";

/** Everything the callback needs and the Redirect URI cannot carry. */
export type YandexStatePayload = {
  /** The exact `redirect_uri` sent to Yandex; the token exchange must repeat it. */
  cb: string;
  /** Tenant handle the flow started at, or null in single-store mode. */
  tn: string | null;
  /** Storefront locale, so the callback can return the buyer to their language. */
  lc: string | null;
  /** Same-origin path to return to, sanitized by the storefront before it gets here. */
  rt: string | null;
  /** Random value the storefront also keeps in an httpOnly cookie. */
  n: string;
  /** Expiry, epoch SECONDS. */
  exp: number;
};

const b64url = (buf: Buffer): string => buf.toString("base64url");

const sign = (secret: string, body: string): string =>
  b64url(crypto.createHmac("sha256", secret).update(body).digest());

/** A fresh nonce for one login attempt. */
export const createNonce = (): string =>
  crypto.randomBytes(16).toString("hex");

/**
 * Build the `state` value: `<base64url(json)>.<base64url(hmac)>`.
 *
 * `ttlSeconds` defaults to 600 because a Yandex authorization code expires in
 * 10 minutes (https://yandex.ru/dev/id/doc/ru/codes/code-url), so a state that
 * outlives it buys nothing.
 */
export function encodeState(
  payload: Omit<YandexStatePayload, "exp">,
  secret: string,
  opts?: { ttlSeconds?: number; nowMs?: number },
): string {
  if (!secret) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Yandex state secret is required",
    );
  }
  const now = opts?.nowMs ?? Date.now();
  const full: YandexStatePayload = {
    ...payload,
    exp: Math.floor(now / 1000) + (opts?.ttlSeconds ?? 600),
  };
  const body = b64url(Buffer.from(JSON.stringify(full), "utf8"));
  return `${body}.${sign(secret, body)}`;
}

export type StateVerdict =
  | { ok: true; payload: YandexStatePayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

/**
 * Verify and decode a `state`.
 *
 * The reasons are distinct on purpose: the storefront reports «the login link
 * expired, try again» for `expired` and a plain failure for the other two, and
 * the unit tests assert a tampered payload never reads as expired.
 */
export function decodeState(
  state: string,
  secret: string,
  opts?: { nowMs?: number },
): StateVerdict {
  if (!secret) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Yandex state secret is required",
    );
  }
  if (typeof state !== "string" || !state.includes(".")) {
    return { ok: false, reason: "malformed" };
  }

  const idx = state.lastIndexOf(".");
  const body = state.slice(0, idx);
  const signature = state.slice(idx + 1);

  if (!body || !signature) {
    return { ok: false, reason: "malformed" };
  }

  const expected = sign(secret, body);
  const given = Buffer.from(signature, "utf8");
  const want = Buffer.from(expected, "utf8");

  // Lengths differ on a truncated signature, and timingSafeEqual throws on a
  // length mismatch rather than returning false, so the check comes first.
  if (
    given.length !== want.length ||
    !crypto.timingSafeEqual(given, want)
  ) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: YandexStatePayload;
  try {
    payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as YandexStatePayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (
    !payload ||
    typeof payload.cb !== "string" ||
    !payload.cb ||
    typeof payload.n !== "string" ||
    !payload.n ||
    typeof payload.exp !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }

  const now = opts?.nowMs ?? Date.now();
  if (payload.exp * 1000 <= now) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, payload };
}
