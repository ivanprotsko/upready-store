import { redirect, type LoaderFunctionArgs } from "react-router"
import { readConfig } from "~/lib/config.server"
import { loginPath } from "~/lib/next-path"
import { setTokenCookie } from "~/lib/session.server"
import { exchangeCode, readCallback } from "~/lib/sso"

/**
 * Where the shop sends the buyer back with a sign-in code. The code is traded
 * for the buyer's token on this server, the token goes into `school_jwt`, and
 * the buyer lands on the page they set out for. A missing, used or stale code
 * goes back to `/login`, which says so and offers «Войти» again.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const config = readConfig()
  const { code, next } = readCallback(new URL(request.url))

  if (!code) {
    throw redirect(loginPath(next, "missing"))
  }

  const result = await exchangeCode({ apiBase: config.apiBase, publishableKey: config.publishableKey, code })

  if (!result.ok) {
    throw redirect(loginPath(next, result.reason))
  }

  return redirect(next, {
    headers: { "set-cookie": setTokenCookie(result.token), "cache-control": "no-store" },
  })
}
