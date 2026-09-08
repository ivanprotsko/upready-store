import { cookies } from "next/headers"

import {
  DEVTOOLS_COOKIE,
  devtoolsCookieIsValid,
  isDevtoolsEnabled,
} from "@lib/devtools/session"
import DevtoolsPanel from "../theme-panel"

/**
 * The one place that decides whether the hidden panel exists for this request.
 *
 * Server component on purpose: the cookie is httpOnly, so no client code can read it,
 * and a visitor without it receives HTML that contains neither the button nor the
 * popover — which is what the acceptance checks with curl. With
 * STOREFRONT_DEVTOOLS_PASSWORD unset or empty the whole feature is off and this renders
 * null before it even looks at the cookie jar.
 *
 * It is mounted from the root layout, which already renders per request (next-intl reads
 * the locale cookie in every render), so this adds no dynamic rendering that was not
 * there: the baseline build has no static page route.
 */
export default async function DevtoolsMount() {
  if (!isDevtoolsEnabled()) return null

  const store = await cookies()
  if (!devtoolsCookieIsValid(store.get(DEVTOOLS_COOKIE)?.value)) return null

  return <DevtoolsPanel />
}
