import { Navigate } from "react-router-dom"

/**
 * `/settings/wildberries` -> `/settings/marketplaces/wildberries`
 * (p01-settings-integrations-restructure).
 *
 * The old path is in the owner's bookmarks, so it stays and redirects rather
 * than 404-ing. What changed is the TARGET: it used to be
 * `/settings/marketplaces#wb`, an anchor into the middle of a shared page, and
 * Ivan's order of 2026-09-16 20:22 WITA removes every `#` from this panel's
 * navigation. Wildberries has a screen of its own now.
 *
 * `replace` so the browser Back button leaves the section instead of bouncing
 * through the old path again.
 */
export const WildberriesRedirect = () => (
  <Navigate replace to="/settings/marketplaces/wildberries" />
)
