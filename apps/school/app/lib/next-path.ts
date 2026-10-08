import { safeNextPath as safeLocalPath } from "./vendor/shop-sso"

export const HOME_PATH = "/app"

/**
 * Where to take the buyer after sign-in: a path of the cabinet, else `/app`.
 * `next` travels through the shop and back in the query, so anything that is
 * not a plain `/app…` path of this host (another host, `//host`, a backslash
 * a browser reads as a slash) is dropped rather than followed.
 *
 * The package's rule (`@upready/shop-sso`, any local path) runs first; the
 * cabinet narrows it to `/app…` and to no backslash anywhere, so `/`, `/login`
 * or `/app\..\x`, which the package lets through, still go home.
 */
export function safeNextPath(next: string | null | undefined): string {
  const local = safeLocalPath(next)

  if (!local.startsWith(HOME_PATH) || local.includes("\\")) {
    return HOME_PATH
  }

  const rest = local.slice(HOME_PATH.length)

  if (rest !== "" && !/^[/?#]/.test(rest)) {
    return HOME_PATH
  }

  return local
}

/** The path and query of a request, the `next` a sign-in brings the buyer back to. */
export function requestPath(request: Request): string {
  const url = new URL(request.url)

  return `${url.pathname}${url.search}`
}

export function loginPath(next: string, error?: string): string {
  const params = new URLSearchParams({ next: safeNextPath(next) })

  if (error) {
    params.set("error", error)
  }

  return `/login?${params.toString()}`
}
