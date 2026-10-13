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

/** The backend's media route, which checks the buyer's access (`api/store/tenant/courses/[id]/media`). */
export const API_MEDIA_PATH = /^\/store\/tenant\/courses\/[^/?#]+\/media(?:\?|$)/

/** The school's own route that walks the browser to a media file (`routes/app-media.ts`). */
export const SCHOOL_MEDIA_ROUTE = "/app/_media"

/**
 * A lesson's video, poster or file address the browser can load. The
 * backend's media route needs the buyer's token, which only the school's
 * server holds, so its addresses, as a path or as a URL on `SCHOOL_API_BASE`,
 * go through the school's own route; anything else is `mediaUrl`.
 */
export function lessonMediaUrl(src: string | null | undefined, apiBase: string, apiOrigin: string | null): string | null {
  if (!src) {
    return null
  }

  let apiPath: string | null = src.startsWith("/") && !src.startsWith("//") ? src : null

  if (!apiPath && /^https?:\/\//i.test(src)) {
    try {
      const url = new URL(src)
      apiPath = url.origin === new URL(apiBase).origin ? `${url.pathname}${url.search}` : null
    } catch {
      apiPath = null
    }
  }

  if (apiPath && API_MEDIA_PATH.test(apiPath)) {
    return `${SCHOOL_MEDIA_ROUTE}?src=${encodeURIComponent(apiPath)}`
  }

  return mediaUrl(src, apiOrigin)
}
