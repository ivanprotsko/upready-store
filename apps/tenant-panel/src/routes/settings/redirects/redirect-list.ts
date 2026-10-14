import type { TenantRedirect } from "../../../hooks/api/redirects"

/**
 * t-2026-10-14-01 (panel redesign, G2): what the list of «Старые адреса»
 * shows for the address it is on, free of React so
 * `src/__tests__/settings-staff-redirects.test.mjs` runs it as is.
 *
 * The backend answers every rule of the shop at once (a few dozen; the
 * migration of Oksana's shop imported 47), so the search, the order and the
 * page are worked out in the browser from the URL (`q`, `order`, `offset`),
 * the same parameters `_DataTable` writes for a list the server pages.
 */

/** An address is an exact pathname: a leading slash, no host, no query, no spaces. */
export const REDIRECT_PATH_PATTERN = /^\/[^\s?#]*$/

/** The columns the list sorts by, in the order its menu offers them. */
export const REDIRECT_ORDER_KEYS = ["from_path", "to_path"] as const

type OrderKey = (typeof REDIRECT_ORDER_KEYS)[number]

const isOrderKey = (key: string): key is OrderKey =>
  (REDIRECT_ORDER_KEYS as readonly string[]).includes(key)

export type RedirectListQuery = {
  q?: string
  /** `from_path`, or `-from_path` for the other direction. */
  order?: string
  offset?: number
  limit: number
}

export const redirectListPage = (
  rows: TenantRedirect[],
  { q, order, offset = 0, limit }: RedirectListQuery
): { rows: TenantRedirect[]; count: number } => {
  const needle = q?.trim().toLowerCase() ?? ""
  const matched = needle
    ? rows.filter(
        (row) =>
          row.from_path.toLowerCase().includes(needle) ||
          row.to_path.toLowerCase().includes(needle)
      )
    : rows

  const key = order?.replace(/^-/, "") ?? ""
  const sorted = isOrderKey(key)
    ? [...matched].sort((a, b) => a[key].localeCompare(b[key]))
    : matched
  if (isOrderKey(key) && order?.startsWith("-")) {
    sorted.reverse()
  }

  const start = Number.isFinite(offset) && offset > 0 ? offset : 0
  return { rows: sorted.slice(start, start + limit), count: matched.length }
}
