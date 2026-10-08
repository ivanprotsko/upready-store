import { safeNextPath } from "./next-path"
import { buildLoginUrl as buildShopLoginUrl, ShopSsoError } from "./vendor/shop-sso"

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
 * The login address and the exchange are the `@upready/shop-sso` package's
 * (t-2026-10-08-36), read from its copy in `vendor/shop-sso.ts`. The school
 * builds on its own and its image never sees `apps/shared`, and
 * `pnpm check:shared-markdown` keeps the copy byte-identical. This module
 * holds what the cabinet adds on top of the package.
 */

export { exchangeCode } from "./vendor/shop-sso"

/** The address of the shop's sign-in that brings the buyer back to `next`, a cabinet page or `/app`. */
export function buildLoginUrl({
  shopOrigin,
  schoolOrigin,
  next,
}: {
  shopOrigin: string
  schoolOrigin: string
  next: string
}): string {
  return buildShopLoginUrl({ shopOrigin, schoolOrigin, next: safeNextPath(next) })
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

/**
 * Why a failed exchange failed, in the words `/login` knows. The package
 * throws a `ShopSsoError`; `expired` is the API refusing the code (used, older
 * than 60 s, or not this shop's), `failed` is anything else, an answer
 * without a token or no answer at all.
 */
export function exchangeFailure(error: unknown): "expired" | "failed" {
  return error instanceof ShopSsoError && [400, 401, 404].includes(error.status) ? "expired" : "failed"
}
