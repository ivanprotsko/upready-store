/**
 * A tenant's path-for-path redirect table (t11-seo-redirects), fetched from
 * `GET /store/tenant/redirects` and cached in the middleware's own process —
 * the same shape as `regionMapCache` in `src/middleware.ts`, because
 * middleware runs in its own runtime with no access to the server components'
 * Next data cache. Sixty seconds per key: a redirect added in the panel is
 * live within that window, no restart and no deploy.
 */

export type TenantRedirect = { from_path: string; to_path: string; status_code: number }

const TTL_MS = 60 * 1000
const MAX_REDIRECT_HOPS = 20

const redirectCache = new Map<string, { byPath: Map<string, TenantRedirect>; updatedAt: number }>()

async function fetchRedirects(
  backendUrl: string,
  publishableKey: string,
): Promise<Map<string, TenantRedirect>> {
  const byPath = new Map<string, TenantRedirect>()

  try {
    const response = await fetch(`${backendUrl}/store/tenant/redirects`, {
      method: "GET",
      headers: { "x-publishable-api-key": publishableKey },
      cache: "no-store",
    })

    if (!response.ok) {
      return byPath
    }

    const { redirects } = (await response.json()) as { redirects: TenantRedirect[] }

    for (const row of redirects ?? []) {
      byPath.set(row.from_path, row)
    }
  } catch {
    // A backend hiccup answers "no redirects this request" rather than taking
    // down every page of the shop — the same failure mode `getRegionMap`
    // chose for a dead regions fetch.
  }

  return byPath
}

/** The tenant's redirect table, refetched at most once per `TTL_MS`. */
export async function getTenantRedirects(
  backendUrl: string,
  publishableKey: string | null,
): Promise<Map<string, TenantRedirect>> {
  if (!publishableKey) {
    return new Map()
  }

  const cached = redirectCache.get(publishableKey)

  if (cached && cached.updatedAt > Date.now() - TTL_MS) {
    return cached.byPath
  }

  const byPath = await fetchRedirects(backendUrl, publishableKey)
  redirectCache.set(publishableKey, { byPath, updatedAt: Date.now() })

  return byPath
}

export type RedirectResolution =
  | { kind: "redirect"; to: string; status: number }
  | { kind: "loop" }
  | { kind: "none" }

/**
 * Follows the chain starting at `pathname` up to `MAX_REDIRECT_HOPS` hops,
 * so a rename that itself got renamed still resolves to the current address
 * in one round trip to the visitor. A path visited twice in the same chain is
 * a loop (`a → b`, `b → a`) — the acceptance case this table's own docs
 * describe — and answers `{ kind: "loop" }` rather than looping forever.
 */
export function resolveRedirect(
  pathname: string,
  byPath: Map<string, TenantRedirect>,
): RedirectResolution {
  if (!byPath.has(pathname)) {
    return { kind: "none" }
  }

  const visited = new Set<string>()
  let current = pathname
  let last: TenantRedirect | undefined

  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
    if (visited.has(current)) {
      return { kind: "loop" }
    }
    visited.add(current)

    const entry = byPath.get(current)
    if (!entry) {
      break
    }
    last = entry
    current = entry.to_path
  }

  if (byPath.has(current)) {
    // The chain is still redirecting after MAX_REDIRECT_HOPS: treat it the
    // same as a detected cycle rather than serving a 21st hop.
    return { kind: "loop" }
  }

  if (!last) {
    return { kind: "none" }
  }

  return { kind: "redirect", to: current, status: last.status_code }
}
