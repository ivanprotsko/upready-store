import { redirect } from "react-router"
import { HOME_PATH, loginPath } from "~/lib/next-path"
import { clearTokenCookie } from "~/lib/session.server"

// Signing out of the school removes `school_jwt` and nothing else: the buyer
// stays signed in to the shop. The header's «Выйти» posts here; opening
// `/logout` by address does the same.
function signOut() {
  return redirect(loginPath(HOME_PATH), { headers: { "set-cookie": clearTokenCookie() } })
}

export const loader = signOut
export const action = signOut
