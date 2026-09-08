import "server-only"

import { createHash, createHmac, timingSafeEqual } from "node:crypto"

/**
 * The hidden settings panel's access check, server-side and nowhere else.
 *
 * Three properties this module exists to guarantee (rule 41 — a guardrail is code,
 * not a convention):
 *
 *   1. the password never reaches the browser. Nothing here is imported by a client
 *      component; `server-only` turns an accidental import into a build error, the way
 *      `lib/data/cookies.ts` already does.
 *   2. the cookie cannot be forged. It carries an expiry and an HMAC over that expiry,
 *      keyed by a hash of the password, and is compared in constant time. A visitor who
 *      writes `document.cookie = "upready_devtools=..."` gets nothing, and changing
 *      STOREFRONT_DEVTOOLS_PASSWORD invalidates every cookie already issued.
 *   3. an empty or unset variable means the feature does not exist: `isDevtoolsEnabled()`
 *      is false, the route answers 404 and the mount renders null. A storefront that
 *      never sets the variable is byte-identical to one without this feature.
 */

/** Cookie name; httpOnly, so no client code can read it — only the server sees it. */
export const DEVTOOLS_COOKIE = "upready_devtools"

/** Seven days, as the brief asks. */
export const DEVTOOLS_TTL_SECONDS = 7 * 24 * 60 * 60

const COOKIE_VERSION = "v1"

/** The configured password, or null when the feature is switched off. */
export function devtoolsPassword(): string | null {
  const raw = process.env.STOREFRONT_DEVTOOLS_PASSWORD
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function isDevtoolsEnabled(): boolean {
  return devtoolsPassword() !== null
}

/** Signing key: a hash of the password, so the password itself is never the HMAC key. */
function signingKey(password: string): Buffer {
  return createHash("sha256").update(`upready-store.devtools ${password}`).digest()
}

function sign(payload: string, password: string): string {
  return createHmac("sha256", signingKey(password)).update(payload).digest("base64url")
}

/**
 * Constant-time password comparison. Both sides are hashed first, so the comparison
 * always runs over 32 bytes and the length of the submitted string leaks nothing.
 */
export function passwordMatches(candidate: unknown): boolean {
  const password = devtoolsPassword()
  if (password === null || typeof candidate !== "string") return false
  const submitted = createHash("sha256").update(candidate).digest()
  const expected = createHash("sha256").update(password).digest()
  return timingSafeEqual(submitted, expected)
}

/** The cookie value for a session that starts now: `v1.<expiry seconds>.<hmac>`. */
export function issueDevtoolsCookie(nowMs: number = Date.now()): string {
  const password = devtoolsPassword()
  if (password === null) {
    throw new Error("devtools: cannot issue a cookie while the feature is off")
  }
  const expiry = Math.floor(nowMs / 1000) + DEVTOOLS_TTL_SECONDS
  const payload = `${COOKIE_VERSION}.${expiry}`
  return `${payload}.${sign(payload, password)}`
}

/**
 * Is this cookie value one we issued, still inside its seven days? Total: every
 * malformed shape answers false rather than throwing, because this runs in the render
 * path of every page.
 */
export function devtoolsCookieIsValid(value: unknown, nowMs: number = Date.now()): boolean {
  const password = devtoolsPassword()
  if (password === null || typeof value !== "string") return false

  const parts = value.split(".")
  if (parts.length !== 3) return false
  const [version, expiryRaw, signature] = parts
  if (version !== COOKIE_VERSION) return false

  const expiry = Number(expiryRaw)
  if (!Number.isSafeInteger(expiry) || expiry * 1000 <= nowMs) return false

  const expected = Buffer.from(sign(`${version}.${expiryRaw}`, password), "utf8")
  const received = Buffer.from(signature, "utf8")
  // timingSafeEqual throws on a length mismatch, which is itself a rejection.
  if (expected.length !== received.length) return false
  return timingSafeEqual(expected, received)
}
