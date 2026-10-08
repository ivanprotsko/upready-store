import { redirect, type LoaderFunctionArgs } from "react-router"
import { readConfig } from "~/lib/config.server"
import { loginPath } from "~/lib/next-path"
import { setTokenCookie } from "~/lib/session.server"
import { exchangeCode, exchangeFailure, readCallback } from "~/lib/sso"

/**
 * Where the shop sends the buyer back with a sign-in code. The code is traded
 * for the buyer's token on this server, the token goes into `school_jwt`, and
 * the buyer lands on the page they set out for. A missing, used or stale code
 * goes back to `/login`, which says so and offers «Войти» again.
 *
 * The package's `exchangeCode` throws on a refusal; it is caught here, so a
 * used or stale code is a redirect to `/login`, never a 500.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const config = readConfig()
  const { code, next } = readCallback(new URL(request.url))

  if (!code) {
    throw redirect(loginPath(next, "missing"))
  }

  let token: string

  try {
    token = (await exchangeCode({ backendUrl: config.apiBase, publishableKey: config.publishableKey, code })).token
  } catch (error) {
    throw redirect(loginPath(next, exchangeFailure(error)))
  }

  if (!token) {
    throw redirect(loginPath(next, "failed"))
  }

  return redirect(next, {
    headers: { "set-cookie": setTokenCookie(token), "cache-control": "no-store" },
  })
}
