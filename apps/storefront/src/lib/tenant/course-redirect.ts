/**
 * `/course-<slug>` (t-2026-09-25-17): the address a course used to answer on
 * directly, before o24-courses moved courses onto their own product's page.
 * `middleware.ts` 308s it to `/<locale>/products/<handle>`; this file is the
 * pure path-matching half of that, kept apart so it can be unit-tested
 * without mocking `fetch` or `NextRequest`.
 */

export type CourseSlugMatch = { locale: string | null; slug: string }

const COURSE_SLUG = /^course-(.+)$/

/**
 * `segments` is the pathname already split on `/` with empty parts dropped
 * (the same shape `middleware.ts` computes once and reuses everywhere). Only
 * a path whose LAST remaining segment is the whole `course-<slug>` address
 * matches: `/course-x/lessons/l1` is not a real address this app ever served,
 * so it is left alone rather than redirected somewhere unexpected.
 */
export function matchCourseSlugPath(
  segments: string[],
  isAppLocale: (segment: string) => boolean
): CourseSlugMatch | null {
  if (segments.length === 1) {
    const match = COURSE_SLUG.exec(segments[0])
    return match ? { locale: null, slug: match[1] } : null
  }

  if (segments.length === 2 && isAppLocale(segments[0])) {
    const match = COURSE_SLUG.exec(segments[1])
    return match ? { locale: segments[0], slug: match[1] } : null
  }

  return null
}

/**
 * The product handle a course's slug sells on, or `null` for an unknown slug,
 * another tenant's slug, or a backend hiccup — every one of those answers the
 * caller's normal 404 rather than a redirect to nowhere, the same failure
 * mode `getTenantRedirects` chose for a dead redirects fetch.
 */
export async function resolveCourseProductHandle(
  backendUrl: string,
  publishableKey: string | null,
  slug: string
): Promise<string | null> {
  if (!publishableKey) {
    return null
  }

  try {
    const response = await fetch(
      `${backendUrl}/store/tenant/courses/by-slug/${encodeURIComponent(slug)}`,
      {
        method: "GET",
        headers: { "x-publishable-api-key": publishableKey },
        cache: "no-store",
      }
    )

    if (!response.ok) {
      return null
    }

    const { product_handle: handle } = (await response.json()) as {
      product_handle?: string
    }

    return handle ?? null
  } catch {
    return null
  }
}
