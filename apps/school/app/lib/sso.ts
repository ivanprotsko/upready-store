import { safeNextPath } from "./next-path"

/**
 * The school's half of the shared sign-in (t-2026-10-08-37, parts B and C).
 * The shop signs the buyer in; the school has no sign-in of its own.
 *
 * 1. `/login` sends the buyer to the shop's
 *    `/api/school-sso?return_to=<school>/auth/callback?next=<path>`.
 * 2. The shop signs the buyer in if needed and sends them back to `return_to`
 *    with `code`, single-use and alive for 60 seconds.
 * 3. `/auth/callback` trades the code for the buyer's token on the school's
 *    server (`POST /store/tenant/sso/exchange`, with the shop's publishable
 *    key) and keeps the token in the `school_jwt` cookie.
 *
 * Part B ships the same two functions as the `@upready/shop-sso` package; this
 * module is replaced by that import once both parts are in.
 */

export const CALLBACK_PATH = "/auth/callback"

/** The address of the shop's sign-in that brings the buyer back to `next`. */
export function buildLoginUrl({
  shopOrigin,
  schoolOrigin,
  next,
}: {
  shopOrigin: string
  schoolOrigin: string
  next: string
}): string {
  const returnTo = new URL(CALLBACK_PATH, schoolOrigin)
  returnTo.searchParams.set("next", safeNextPath(next))

  const login = new URL("/api/school-sso", shopOrigin)
  login.searchParams.set("return_to", returnTo.toString())

  return login.toString()
}

/**
 * The code and the path out of the address the shop sent the buyer back to.
 * The shop is expected to add `code` as a parameter of its own; when it glues
 * `?code=…` onto a `return_to` that already has a query, the code ends up
 * inside `next`, and it is read from there.
 */
export function readCallback(url: URL): { code: string | null; next: string } {
  let code = url.searchParams.get("code")
  let next = url.searchParams.get("next") ?? ""

  const glued = /[?&]code=([^&#]*)/.exec(next)

  if (glued) {
    code ??= decodeURIComponent(glued[1] ?? "")
    next = next.slice(0, glued.index)
  }

  return { code: code?.trim() || null, next: safeNextPath(next) }
}

export type ExchangeResult =
  | { ok: true; token: string }
  /** `expired`: the API refused the code (used, older than 60 s, or not this shop's). */
  | { ok: false; reason: "expired" | "failed" }

/** Trades a sign-in code for the buyer's token. Never throws; never logs the code or the token. */
export async function exchangeCode({
  apiBase,
  publishableKey,
  code,
  fetchImpl = fetch,
}: {
  apiBase: string
  publishableKey: string
  code: string
  fetchImpl?: typeof fetch
}): Promise<ExchangeResult> {
  let response: Response

  try {
    response = await fetchImpl(`${apiBase}/store/tenant/sso/exchange`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-publishable-api-key": publishableKey,
      },
      body: JSON.stringify({ code }),
    })
  } catch {
    return { ok: false, reason: "failed" }
  }

  if (response.status === 401 || response.status === 400 || response.status === 404) {
    return { ok: false, reason: "expired" }
  }

  if (!response.ok) {
    return { ok: false, reason: "failed" }
  }

  const body = (await response.json().catch(() => null)) as { token?: unknown } | null

  return typeof body?.token === "string" && body.token
    ? { ok: true, token: body.token }
    : { ok: false, reason: "failed" }
}
