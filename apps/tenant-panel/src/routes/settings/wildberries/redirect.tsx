import { Navigate, useLocation } from "react-router-dom"

/**
 * `/settings/wildberries` -> `/settings/marketplaces/wildberries`
 * (p01-settings-integrations-restructure).
 *
 * The old path is in the owner's bookmarks, so it stays and redirects rather
 * than 404-ing. What changed is the TARGET: it used to be
 * the shared hub plus a `#wb` anchor into the middle of it, and
 * Ivan's order of 2026-09-16 20:22 WITA removes every `#` from this panel's
 * navigation. Wildberries has a screen of its own now.
 *
 * `replace` so the browser Back button leaves the section instead of bouncing
 * through the old path again. The query string is carried over, as on every
 * old address of the section (mp-section-design).
 */
export const WildberriesRedirect = () => {
  const { search } = useLocation()
  return <Navigate replace to={`/settings/marketplaces/wildberries${search}`} />
}
