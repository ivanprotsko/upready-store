/**
 * @upready/shop-sso — the school's half of the shop sign-in (t-2026-10-08-36).
 *
 * The shop attests the buyer and the school keeps no login of its own:
 *
 *   1. the school's `/login` sends the buyer to `buildLoginUrl(…)`, the shop's
 *      `/api/school-sso`, which signs the buyer in if needed;
 *   2. the shop sends the buyer back to `<callback>?next=<path>&code=<code>`;
 *   3. the school's server calls `exchangeCode(…)` and stores the token it gets
 *      in the `school_jwt` cookie (`serializeSchoolJwtCookie`);
 *   4. every call to the shop's API goes from the school's server, with
 *      `shopApiHeaders(…)`; the browser never talks to the shop's API;
 *   5. signing out of the school clears `school_jwt` only
 *      (`clearSchoolJwtCookie`), the shop's own session stays.
 *
 * Server-side only, free of any framework: the school's routes hand it a
 * `fetch` and read or write the headers themselves.
 */

/** The cookie the school keeps the buyer's shop token in. */
export const SCHOOL_JWT_COOKIE = "school_jwt"

/** Seven days, as long as the shop keeps its own `_medusa_jwt`. */
export const SCHOOL_JWT_MAX_AGE_SECONDS = 7 * 24 * 60 * 60

/**
 * The cookie's attributes. No `Domain`, so it stays on the school's own host
 * and never reaches the shop or a sibling sub-domain. `Lax` lets it ride the
 * top-level navigation back from the shop.
 */
export const schoolJwtCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: SCHOOL_JWT_MAX_AGE_SECONDS,
} as const

/** The callback path the shop sends the buyer back to, unless told otherwise. */
export const DEFAULT_CALLBACK_PATH = "/auth/callback"

/** The query parameter the shop puts the code in. */
export const CODE_PARAM = "code"

/** The query parameter the school carries the buyer's page in. */
export const NEXT_PARAM = "next"

/**
 * `raw` when it is a path on the school itself, `/` otherwise. A protocol
 * relative path (`//host`), a backslash disguised one (`/\host`), an absolute
 * URL and anything with a control or whitespace character are refused, the
 * rule the shop applies to its own return paths.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/")) {
    return "/"
  }
  if (/[\x00-\x1f\x7f\s]/.test(raw)) {
    return "/"
  }
  return raw.replace(/\\/g, "/").startsWith("//") ? "/" : raw
}

export type BuildLoginUrlOptions = {
  /** The shop that signs the buyer in, e.g. `https://cherkashino.ru`. */
  shopOrigin: string
  /** The school itself, e.g. `https://school.cherkashina.ru`. */
  schoolOrigin: string
  /** The school page to land on after sign-in; anything not local becomes `/`. */
  next?: string | null
  /** Where the shop sends the code; `/auth/callback` by default. */
  callbackPath?: string
}

/** The callback address the shop sends the code to, with `next` in it. */
export function buildCallbackUrl({
  schoolOrigin,
  next,
  callbackPath = DEFAULT_CALLBACK_PATH,
}: Omit<BuildLoginUrlOptions, "shopOrigin">): string {
  const callback = new URL(callbackPath, schoolOrigin)
  callback.searchParams.set(NEXT_PARAM, safeNextPath(next))
  return callback.toString()
}

/**
 * The shop's sign-in for the school:
 * `https://cherkashino.ru/api/school-sso?return_to=https://school.cherkashina.ru/auth/callback?next=<path>`,
 * with `return_to` encoded. The shop answers 400 unless the callback's host is
 * on its `SCHOOL_SSO_RETURN_HOSTS`.
 */
export function buildLoginUrl(options: BuildLoginUrlOptions): string {
  const login = new URL("/api/school-sso", options.shopOrigin)
  login.searchParams.set("return_to", buildCallbackUrl(options))
  return login.toString()
}

/** A refusal from the shop, or a call the shop never answered (`status` 0). */
export class ShopSsoError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "ShopSsoError"
    this.status = status
  }
}

export type ExchangeCodeOptions = {
  /** The shop's API, e.g. the backend's internal address. */
  backendUrl: string
  /** The shop's publishable key: the code is good for this shop only. */
  publishableKey: string
  /** The `code` the callback received. */
  code: string | null | undefined
  /** Injected for the tests and for runtimes without a global one. */
  fetch?: typeof fetch
}

/**
 * Trades the code for the buyer's token at
 * `POST <backendUrl>/store/tenant/sso/exchange`. The code is single use and
 * good for 60 seconds, so call this once, right in the callback. Throws a
 * `ShopSsoError`: 401 for a code that is unknown, expired, used already or
 * minted for another shop; 400 for a missing code.
 */
export async function exchangeCode({
  backendUrl,
  publishableKey,
  code,
  fetch: doFetch = fetch,
}: ExchangeCodeOptions): Promise<{ token: string }> {
  if (!code) {
    throw new ShopSsoError(400, "No code in the callback.")
  }

  let res: Response
  try {
    res = await doFetch(`${backendUrl.replace(/\/+$/, "")}/store/tenant/sso/exchange`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-publishable-api-key": publishableKey,
      },
      body: JSON.stringify({ code }),
      cache: "no-store",
    })
  } catch (error) {
    throw new ShopSsoError(0, `The shop did not answer: ${String(error)}`)
  }

  const data = (await res.json().catch(() => ({}))) as {
    token?: unknown
    message?: unknown
  }

  if (!res.ok || typeof data.token !== "string") {
    const message =
      typeof data.message === "string" ? data.message : `The shop answered ${res.status}.`
    throw new ShopSsoError(res.ok ? 502 : res.status, message)
  }

  return { token: data.token }
}

/** The headers of every call the school's server makes to the shop's API. */
export function shopApiHeaders({
  token,
  publishableKey,
}: {
  token: string
  publishableKey: string
}): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "x-publishable-api-key": publishableKey,
  }
}

const cookieAttributes = (maxAge: number) =>
  `Max-Age=${maxAge}; Path=${schoolJwtCookieOptions.path}; HttpOnly; Secure; SameSite=Lax`

/** The `Set-Cookie` value that stores the token. */
export function serializeSchoolJwtCookie(
  token: string,
  maxAge: number = SCHOOL_JWT_MAX_AGE_SECONDS
): string {
  return `${SCHOOL_JWT_COOKIE}=${encodeURIComponent(token)}; ${cookieAttributes(maxAge)}`
}

/** The `Set-Cookie` value that signs the buyer out of the school, and only the school. */
export function clearSchoolJwtCookie(): string {
  return `${SCHOOL_JWT_COOKIE}=; ${cookieAttributes(0)}`
}

/** The token out of a `Cookie` request header, or `null`. */
export function readSchoolJwt(cookieHeader: string | null | undefined): string | null {
  for (const part of (cookieHeader ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=")
    if (name === SCHOOL_JWT_COOKIE) {
      const value = rest.join("=")
      if (!value) {
        return null
      }
      try {
        return decodeURIComponent(value)
      } catch {
        return null
      }
    }
  }
  return null
}
