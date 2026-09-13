/**
 * Where the Mini App entry sends a visitor, decided from Telegram's start
 * parameter. Telegram passes `startapp=<value>` of a launch link "in the
 * start_param field and in the GET parameter tgWebAppStartParam"
 * (https://core.telegram.org/bots/webapps, "Direct Link Mini Apps"), so the
 * server-rendered entry page can redirect without any client script.
 *
 * Vocabulary (the backend builds these links in
 * apps/backend/src/telegram/mini-app.ts):
 *   product_<handle>    → /products/<handle>
 *   category_<handle>   → /categories/<handle>
 *   collection_<handle> → /collections/<handle>
 *   cart                → /cart
 *   anything else       → /store, the catalog
 * Paths are locale-less; the caller prefixes the resolved locale.
 */

const HANDLE_RE = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/

const PREFIXES: Record<string, string> = {
  product: "/products",
  category: "/categories",
  collection: "/collections",
}

export const CATALOG_PATH = "/store"

export function entryTargetPath(startParam: string | undefined | null): string {
  if (!startParam) return CATALOG_PATH
  if (startParam === "cart") return "/cart"
  const underscore = startParam.indexOf("_")
  if (underscore === -1) return CATALOG_PATH
  const kind = startParam.slice(0, underscore)
  const handle = startParam.slice(underscore + 1)
  const prefix = PREFIXES[kind]
  if (!prefix || !HANDLE_RE.test(handle)) return CATALOG_PATH
  return `${prefix}/${handle}`
}
