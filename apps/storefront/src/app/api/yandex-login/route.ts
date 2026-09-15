/**
 * GET /api/yandex-login — step 1 of «Sign in with Yandex ID».
 *
 * Asks Medusa for the consent-screen URL (POST /auth/customer/yandex, handled
 * by the `auth-yandex` provider) and 302s the buyer there. Because it is a
 * plain GET, the control on the login page is a link and the first leg of the
 * flow works with no client-side JavaScript at all.
 *
 * Two short-lived httpOnly cookies cross the round trip: where the buyer came
 * from, and the `nonce` that binds the callback to THIS browser.
 */
import { NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"

import {
  LOCALE_COOKIE,
  NONCE_COOKIE,
  RETURN_COOKIE,
  backendUrl,
  resolveLocale,
  resolveShop,
  sanitizeReturnPath,
  withError,
} from "@lib/util/yandex-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TEN_MINUTES = 10 * 60

export async function GET(req: NextRequest) {
  const returnTo = sanitizeReturnPath(req.nextUrl.searchParams.get("return"))
  const locale = resolveLocale(returnTo, req.cookies.get(LOCALE_COOKIE)?.value)

  // The Yandex application registers ONE Redirect URI per storefront host, and
  // matches it character for character. It is built from the host the buyer is
  // actually on, so every tenant domain works from its own address, and it
  // carries no locale: a locale in the path would mean 36 registrations per
  // host instead of one (the language travels inside the signed `state`).
  const host = req.headers.get("host")
  const proto =
    req.headers.get("x-forwarded-proto") ??
    req.nextUrl.protocol.replace(":", "")
  const origin = host ? `${proto}://${host}` : req.nextUrl.origin
  const callbackUrl = `${origin}/api/yandex-callback`

  const { handle } = await resolveShop(host)
  const nonce = crypto.randomBytes(16).toString("hex")

  let location: string | undefined

  try {
    const res = await fetch(`${backendUrl()}/auth/customer/yandex`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_url: callbackUrl,
        tenant: handle,
        locale,
        return_to: returnTo,
        nonce,
      }),
      cache: "no-store",
    })
    const data = (await res.json().catch(() => ({}))) as {
      location?: string
      message?: string
    }
    if (!res.ok || !data.location) {
      // The usual cause is an unconfigured backend: without YANDEX_CLIENT_ID
      // the provider is not registered and Medusa answers «Unable to retrieve
      // the auth provider with id: yandex». The second is a callback origin
      // the backend does not allow (YANDEX_CALLBACK_ORIGINS).
      console.error(
        "[yandex-login] no redirect from Medusa:",
        res.status,
        data.message ?? "",
      )
      return NextResponse.redirect(
        new URL(withError(returnTo, "unconfigured"), req.nextUrl.origin),
      )
    }
    location = data.location
  } catch (err) {
    console.error("[yandex-login] backend unreachable:", err)
    return NextResponse.redirect(
      new URL(withError(returnTo, "failed"), req.nextUrl.origin),
    )
  }

  const response = NextResponse.redirect(location)
  const cookie = {
    httpOnly: true,
    // "lax": the buyer comes back from oauth.yandex.ru through a top-level
    // cross-site GET, on which a "strict" cookie is withheld — the same reason
    // the payment return cookies are lax (AGENTS.md, «Cookie sameSite»).
    sameSite: "lax" as const,
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: TEN_MINUTES,
  }
  response.cookies.set(RETURN_COOKIE, returnTo, cookie)
  response.cookies.set(NONCE_COOKIE, nonce, cookie)
  return response
}
