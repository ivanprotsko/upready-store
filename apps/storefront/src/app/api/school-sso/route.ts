/**
 * GET /api/school-sso?return_to=<full address> — the shop signs its buyer into
 * the school (t-2026-10-08-36, part B).
 *
 * The school has no login of its own. Its `/login` sends the buyer here, and
 * this handler answers in one of three ways:
 *
 *   - `return_to` on a host outside `SCHOOL_SSO_RETURN_HOSTS`: 400;
 *   - no session: to `/api/yandex-login`, which brings the buyer back here
 *     signed in (a failed sign-in comes back with `?yandex_error=` and goes on
 *     to the shop's login page instead, which returns here too, so a backend
 *     without Yandex never loops);
 *   - a session: the backend mints a single-use code for this buyer and this
 *     shop (`POST /store/tenant/sso/code`), and the buyer goes on to
 *     `<return_to>?code=<code>`, which the school's server trades for the
 *     buyer's token.
 *
 * The buyer's own sign-in to the shop is untouched: `_medusa_jwt` is read
 * here, never written.
 */
import { NextRequest, NextResponse } from "next/server"

import { requestOrigin } from "@lib/tenant/origin"
import { allowedSchoolReturnUrl } from "@lib/util/school-sso"
import {
  LOCALE_COOKIE,
  backendUrl,
  resolveLocale,
  resolveShop,
} from "@lib/util/yandex-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const plain = (message: string, status: number) =>
  new NextResponse(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })

export async function GET(req: NextRequest) {
  const target = allowedSchoolReturnUrl(
    req.nextUrl.searchParams.get("return_to"),
    process.env.SCHOOL_SSO_RETURN_HOSTS
  )

  if (!target) {
    return plain("return_to is not an allowed address", 400)
  }

  // Every redirect goes back to the address the buyer is on, as in the two
  // Yandex handlers: the parsed URL is the server's bind address behind the
  // proxy.
  const origin =
    requestOrigin(req.headers, req.nextUrl.protocol) || req.nextUrl.origin
  const self = `/api/school-sso?${new URLSearchParams({
    return_to: target.toString(),
  })}`

  const signIn = () => {
    const failure = req.nextUrl.searchParams.get("yandex_error")
    if (failure) {
      const locale = resolveLocale("/", req.cookies.get(LOCALE_COOKIE)?.value)
      const params = new URLSearchParams({ return: self, yandex_error: failure })
      return NextResponse.redirect(
        new URL(`/${locale}/account?${params}`, origin)
      )
    }
    return NextResponse.redirect(
      new URL(`/api/yandex-login?${new URLSearchParams({ return: self })}`, origin)
    )
  }

  const token = req.cookies.get("_medusa_jwt")?.value
  if (!token) {
    return signIn()
  }

  const { publishableKey } = await resolveShop(req.headers.get("host"))

  let answer: Response
  try {
    answer = await fetch(`${backendUrl()}/store/tenant/sso/code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(publishableKey ? { "x-publishable-api-key": publishableKey } : {}),
      },
      body: JSON.stringify({ return_to: target.toString() }),
      cache: "no-store",
    })
  } catch (err) {
    console.error("[school-sso] backend unreachable:", err)
    return plain("school sign-in is unavailable", 502)
  }

  // An expired session reads as none: sign in again and come back.
  if (answer.status === 401) {
    return signIn()
  }

  const data = (await answer.json().catch(() => ({}))) as { code?: unknown }
  if (!answer.ok || typeof data.code !== "string") {
    console.error("[school-sso] no code from Medusa:", answer.status)
    return plain("school sign-in is unavailable", 502)
  }

  target.searchParams.set("code", data.code)
  const response = NextResponse.redirect(target)
  // The code is the one secret in this address, so no cache keeps the answer.
  response.headers.set("Cache-Control", "no-store")
  return response
}
