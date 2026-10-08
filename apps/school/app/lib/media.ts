/**
 * The origin a bare `/static/…` path of the API is resolved against, for the
 * buyer's browser. That is `SCHOOL_API_BASE` only when it is a public https
 * address: on the host it is usually the backend's internal name, which no
 * browser can reach, and a picture with no reachable address is left out
 * rather than shown broken.
 */
export function publicApiOrigin(apiBase: string): string | null {
  return /^https:\/\//i.test(apiBase) ? new URL(apiBase).origin : null
}

/** An image address the browser can load, or null. */
export function mediaUrl(src: string | null | undefined, apiOrigin: string | null): string | null {
  if (!src) {
    return null
  }

  if (/^https?:\/\//i.test(src)) {
    return src
  }

  return src.startsWith("/") && !src.startsWith("//") && apiOrigin ? `${apiOrigin}${src}` : null
}
