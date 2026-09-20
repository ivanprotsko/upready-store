/**
 * Shared plumbing for the two Yandex ID route handlers.
 *
 * Both run in the Node.js runtime OUTSIDE React, so they talk to Medusa over
 * plain `fetch` rather than through the `sdk` in `@lib/config`: that client is
 * a `"use server"` module whose header plumbing reads `next/headers`, and a
 * route handler under `src/app/api` gets neither the locale prefix nor the
 * tenant headers the middleware adds (AGENTS.md, «The middleware matcher»).
 * The tenant is therefore resolved here, by Host, the same way
 * `lib/config.ts` falls back to when the middleware header is missing.
 */

import { isAppLocale, defaultLocale, LOCALE_COOKIE } from "@i18n/config"
import { resolveTenantByHost } from "@lib/tenant/resolve"

/** Carries the page the buyer started the login from, across the Yandex round trip. */
export const RETURN_COOKIE = "_yandex_return"

/**
 * Carries the `nonce` that is also inside the signed `state`.
 *
 * This is the CSRF half that the signature alone cannot provide: a signed state
 * proves the backend issued it, not that THIS browser asked for it. An attacker
 * can always start a flow of their own and get a state that verifies, so the
 * callback additionally requires the nonce inside the state to equal the one in
 * this httpOnly cookie, which an attacker cannot write.
 */
export const NONCE_COOKIE = "_yandex_nonce"

/** Error codes the login page turns into a readable message via ?yandex_error=. */
export type YandexErrorCode =
  | "unconfigured"
  | "denied"
  | "rejected"
  | "expired"
  | "email_taken"
  | "no_email"
  | "failed"

export const backendUrl = (): string =>
  (
    process.env.MEDUSA_BACKEND_URL ??
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ??
    "http://localhost:9000"
  ).replace(/\/+$/, "")

/**
 * The publishable key and handle of the shop this request belongs to.
 *
 * `/store/*` answers 400 without a key, and on this platform the key belongs to
 * the REQUEST, not to the process: `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` is
 * deliberately unset on the multi-tenant deployment and survives only as the
 * single-store fallback (`lib/config.ts`).
 */
export async function resolveShop(
  host: string | null,
): Promise<{ handle: string | null; publishableKey: string | null }> {
  const fallback = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? null

  if (host) {
    try {
      const tenant = await resolveTenantByHost(backendUrl(), host)
      if (tenant?.publishableKey) {
        return { handle: tenant.handle, publishableKey: tenant.publishableKey }
      }
      if (tenant) {
        return { handle: tenant.handle, publishableKey: fallback }
      }
    } catch (error) {
      // Not an answer, so it must not read as «single store». The fallback
      // below is the same one lib/config.ts uses, and the line is here rather
      // than swallowed (rule 20a).
      console.error("[yandex-auth] tenant lookup failed:", error)
    }
  }

  return { handle: null, publishableKey: fallback }
}

/**
 * Only same-origin absolute paths survive. An attacker-supplied `return` must
 * never turn the login link into an open redirect: `//evil.com` and
 * `https://evil.com` are both rejected, and anything else falls back to `/`.
 */
export function sanitizeReturnPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/"
  }
  // Strip any marker left over from a previous failed attempt, so a second
  // failure does not stack two of them on the URL.
  const [path, query = ""] = raw.split("?")
  const params = new URLSearchParams(query)
  params.delete("yandex_error")
  const rest = params.toString()
  return rest ? `${path}?${rest}` : path
}

/** Append `?yandex_error=<code>` to the return path. */
export function withError(returnPath: string, code: YandexErrorCode): string {
  const [path, query = ""] = returnPath.split("?")
  const params = new URLSearchParams(query)
  params.set("yandex_error", code)
  return `${path}?${params.toString()}`
}

/**
 * The locale to come back in.
 *
 * `src/app/api` is outside the middleware matcher, so there is no locale in the
 * request: it is read off the path the buyer started from, then off the
 * `_medusa_locale` cookie the middleware wrote on the page they were looking
 * at, and only then off the build default.
 */
export function resolveLocale(
  returnPath: string,
  cookieLocale: string | null | undefined,
): string {
  const first = returnPath.split("?")[0].split("/").filter(Boolean)[0]
  if (first && isAppLocale(first)) {
    return first
  }
  if (cookieLocale && isAppLocale(cookieLocale)) {
    return cookieLocale
  }
  return defaultLocale
}

/** The `/account` page of a locale, where a signed-in buyer belongs. */
export const accountPath = (locale: string): string => `/${locale}/account`

export { LOCALE_COOKIE }

export type MedusaJwtPayload = {
  actor_id?: string
  actor_type?: string
  auth_identity_id?: string
  user_metadata?: {
    email?: string
    first_name?: string | null
    last_name?: string | null
    name?: string | null
    picture?: string | null
    login?: string | null
  }
}

/**
 * Read the payload of a Medusa JWT WITHOUT verifying it.
 *
 * Safe here and only here: the token was just handed to us by our own backend
 * over a server-to-server call, and the payload drives two non-security
 * decisions only, «does this auth identity already have a customer» and «what
 * email do we create that customer with». It is never trusted as proof of
 * identity: every call that follows re-presents the token to Medusa, which
 * does verify it.
 */
export function decodeJwtPayload(token: string): MedusaJwtPayload | null {
  const part = token.split(".")[1]
  if (!part) {
    return null
  }
  try {
    const json = Buffer.from(
      part.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8")
    return JSON.parse(json) as MedusaJwtPayload
  } catch {
    return null
  }
}
