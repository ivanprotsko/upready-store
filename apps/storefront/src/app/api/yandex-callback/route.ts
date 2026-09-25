/**
 * GET /api/yandex-callback — step 2 of «Sign in with Yandex ID».
 *
 * This is the URL the Yandex application registers as its Redirect URI. Yandex
 * sends the buyer here with `?code&state`; everything below is
 * server-to-server:
 *
 *   1. check the state's nonce against the httpOnly cookie (the CSRF half a
 *      signature cannot provide)
 *   2. hand code+state to Medusa                    -> JWT for the auth identity
 *   3. first login (actor_id empty)                 -> link an existing account
 *      by verified email, else create one, then refresh the JWT so it carries
 *      the customer id
 *   4. set _medusa_jwt, move the anonymous cart onto the customer, revalidate
 *   5. 302 back to the page the buyer started from
 *
 * Nothing renders here. Every failure redirects back with `?yandex_error=<code>`,
 * which the login page turns into a sentence in the buyer's language — never a
 * stack trace.
 */
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

import { requestOrigin, requestScheme } from "@lib/tenant/origin"
import {
  LOCALE_COOKIE,
  NONCE_COOKIE,
  RETURN_COOKIE,
  accountPath,
  backendUrl,
  decodeJwtPayload,
  resolveLocale,
  resolveShop,
  sanitizeReturnPath,
  withError,
  type YandexErrorCode,
} from "@lib/util/yandex-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** The nonce the backend signed into the state, without trusting the signature. */
function nonceFromState(state: string): string | null {
  const body = state.split(".")[0]
  if (!body) {
    return null
  }
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as { n?: unknown }
    return typeof payload.n === "string" ? payload.n : null
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const cookieReturn = req.cookies.get(RETURN_COOKIE)?.value
  const locale = resolveLocale(
    cookieReturn ?? "/",
    req.cookies.get(LOCALE_COOKIE)?.value,
  )
  // A buyer whose cookie is gone still has to land somewhere sensible, and the
  // login page is where the error message is rendered.
  const returnTo = sanitizeReturnPath(cookieReturn ?? accountPath(locale))

  // Every redirect goes back to the address the buyer is on. The URL Next
  // parsed is the server's own bind address behind the proxy (on live
  // `https://0.0.0.0:8000`), so it is only the fallback for a request with no
  // Host at all (docs/auth-yandex.md, «Four things that are easy to get wrong»).
  const origin =
    requestOrigin(req.headers, req.nextUrl.protocol) || req.nextUrl.origin

  const clearCrossing = (res: NextResponse) => {
    res.cookies.set(RETURN_COOKIE, "", { path: "/", maxAge: -1 })
    res.cookies.set(NONCE_COOKIE, "", { path: "/", maxAge: -1 })
    return res
  }

  const fail = (code: YandexErrorCode) =>
    clearCrossing(
      NextResponse.redirect(new URL(withError(returnTo, code), origin)),
    )

  const query = req.nextUrl.searchParams

  if (query.get("error")) {
    // The buyer pressed «Deny» on the Yandex consent screen.
    return fail("denied")
  }

  const code = query.get("code")
  const state = query.get("state")
  if (!code || !state) {
    return fail("rejected")
  }

  // --- 1. the nonce binds this callback to the browser that started the flow --
  const expectedNonce = req.cookies.get(NONCE_COOKIE)?.value
  const stateNonce = nonceFromState(state)
  if (!expectedNonce || !stateNonce || expectedNonce !== stateNonce) {
    // Either the login was started in another browser (or over ten minutes
    // ago, so the cookie expired), or somebody fed this URL to the buyer.
    console.error("[yandex-callback] nonce mismatch, refusing the callback")
    return fail("expired")
  }

  // --- 2. exchange the callback for a Medusa JWT -----------------------------
  let token: string
  try {
    const url = new URL(`${backendUrl()}/auth/customer/yandex/callback`)
    url.searchParams.set("code", code)
    url.searchParams.set("state", state)

    const res = await fetch(url.toString(), { method: "GET", cache: "no-store" })
    const data = (await res.json().catch(() => ({}))) as {
      token?: string
      message?: string
    }

    if (!res.ok || !data.token) {
      const message = data.message ?? ""
      console.error(
        "[yandex-callback] validateCallback rejected:",
        res.status,
        message,
      )
      if (/login:email/i.test(message)) {
        return fail("no_email")
      }
      if (/expired/i.test(message)) {
        return fail("expired")
      }
      return fail("rejected")
    }
    token = data.token
  } catch (err) {
    console.error("[yandex-callback] backend unreachable:", err)
    return fail("failed")
  }

  // --- 3. first login: link an existing account, else create one -------------
  const { publishableKey } = await resolveShop(req.headers.get("host"))

  const storeHeaders = (bearer: string): Record<string, string> => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${bearer}`,
    ...(publishableKey ? { "x-publishable-api-key": publishableKey } : {}),
  })

  const payload = decodeJwtPayload(token)

  if (!payload?.actor_id) {
    const email = payload?.user_metadata?.email
    if (!email) {
      // The provider refuses to create an identity without an email, so this
      // only happens if the token shape changes. Fail loudly rather than
      // create a customer under a placeholder address.
      console.error("[yandex-callback] token carries no email in user_metadata")
      return fail("failed")
    }

    try {
      // 3a. The same person may already have an account under this address
      // (email and password, or an earlier import). Attaching the Yandex
      // identity to it is the difference between «second way in» and
      // «your own address is taken».
      let linked = false
      const linkRes = await fetch(
        `${backendUrl()}/store/customers/oauth-link`,
        { method: "POST", headers: storeHeaders(token), cache: "no-store" },
      )
      if (linkRes.ok) {
        const linkBody = (await linkRes.json().catch(() => ({}))) as {
          linked?: boolean
        }
        linked = Boolean(linkBody.linked)
      } else {
        // Not fatal on its own: creation below still runs, and it is the call
        // whose failure the buyer would actually see. Logged, never swallowed.
        console.error(
          "[yandex-callback] oauth-link answered",
          linkRes.status,
          await linkRes.text().catch(() => ""),
        )
      }

      // 3b. Nobody owned the address: make the account.
      if (!linked) {
        const res = await fetch(`${backendUrl()}/store/customers`, {
          method: "POST",
          headers: storeHeaders(token),
          cache: "no-store",
          body: JSON.stringify({
            email,
            first_name: payload?.user_metadata?.first_name ?? "",
            last_name: payload?.user_metadata?.last_name ?? "",
            metadata: {
              locale,
              yandex_login: payload?.user_metadata?.login ?? null,
            },
          }),
        })

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            message?: string
          }
          const message = body.message ?? `${res.status}`
          if (/already exists|already has an account|duplicate|unique/i.test(message)) {
            // The link step did not match but creation says the address is
            // taken: a guest row, or a race with another sign-up.
            console.error("[yandex-callback] email already taken:", email)
            return fail("email_taken")
          }
          console.error("[yandex-callback] customer creation failed:", message)
          return fail("failed")
        }
      }

      // The JWT above was issued before the customer existed, so its actor_id
      // is empty and /store/customers/me would answer 401. Refresh it.
      const refreshed = await fetch(`${backendUrl()}/auth/token/refresh`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
      const refreshedData = (await refreshed.json().catch(() => ({}))) as {
        token?: string
      }
      if (!refreshed.ok || !refreshedData.token) {
        console.error(
          "[yandex-callback] token refresh failed:",
          refreshed.status,
        )
        return fail("failed")
      }
      token = refreshedData.token
    } catch (err) {
      console.error("[yandex-callback] account step threw:", err)
      return fail("failed")
    }
  }

  // --- 4. session cookie, cart transfer, cache invalidation ------------------
  const response = clearCrossing(
    NextResponse.redirect(new URL(returnTo, origin)),
  )

  // Same semantics as setAuthToken() in lib/data/cookies.ts. Secure on the
  // scheme the buyer is on, which behind a TLS proxy is not the URL's.
  response.cookies.set("_medusa_jwt", token, {
    maxAge: 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: "lax",
    secure: requestScheme(req.headers, req.nextUrl.protocol) === "https",
    path: "/",
  })

  const cartId = req.cookies.get("_medusa_cart_id")?.value
  if (cartId) {
    try {
      await fetch(`${backendUrl()}/store/carts/${cartId}/customer`, {
        method: "POST",
        headers: storeHeaders(token),
        cache: "no-store",
      })
    } catch (err) {
      // Not fatal: the buyer is signed in, the cart just stays anonymous.
      console.error("[yandex-callback] cart transfer failed:", err)
    }
  }

  const cacheId = req.cookies.get("_medusa_cache_id")?.value
  if (cacheId) {
    revalidateTag(`customers-${cacheId}`)
    revalidateTag(`carts-${cacheId}`)
  }

  return response
}
